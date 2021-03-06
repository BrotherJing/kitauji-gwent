let Backbone = require("backbone");
let Handlebars = require('handlebars/runtime').default;
let Modal = require("./modal");
let SideView = require("./side-view");
let LuckyDraw = require("./lucky-draw");
let Notification = require("./notification");
let Preview = require("./preview");
let ContestResultModal = require("./contest-result");

const util = require("../util");

Handlebars.registerPartial("messages", require("../../templates/message.handlebars"));

let BattleView = Backbone.View.extend({
  template: require("../../templates/battle.handlebars"),
  initialize: function(options){
    let user = this.user = options.user;
    this.app = options.app;
    this.isReplay = options.isReplay || false;
    this.readOnly = this.isReplay || options.isWatching;
    this.isRecording = options.isRecording || !this.isReplay;
    this.gameRecords = options.gameRecords || [];
    this.waitForAnimation = false;
    this.messages = [];

    $(this.el).prependTo('.gwent-battle');

    this.listenTo(user, "change:showPreview", this.renderPreview);
    this.listenTo(user, "change:waiting", this.render);
    this.listenTo(user, "change:passing", this.render);
    this.listenTo(user, "change:openDiscard", this.render);
    this.listenTo(user, "change:setAgile", this.render);
    this.listenTo(user, "change:setHorn", this.render);
    this.listenTo(user, "change:chooseAttack", this.render);
    this.listenTo(user, "change:chooseHeal", this.render);
    this.listenTo(user, "change:isReDrawing", this.render);
    this.listenTo(user, "change:chooseSide", this.render);
    this.listenTo(user, "change:theme", this.render);

    if (user.get("scenario") && (
      user.get("questProgress")[user.get("scenario")] === 4
    )) {
      bgm.setMode("finale", true);
    } else {
      bgm.setMode("battle", true);
    }
    this.render();


    this.yourSide = new SideView({side: ".player", app: this.app, battleView: this});
    this.otherSide = new SideView({side: ".foe", app: this.app, battleView: this});

    this.setUpBattleEvents();

    if (this.isReplay) {
      this.startReplay();
      return;
    }

    //TODO: send gameLoaded when user press READY button
    if (!this.readOnly) {
      this.app.send("request:gameLoaded", {_roomID: user.get("room")});
    }
  },
  events: {
    "mouseover .card>i": "onMouseover",
    "mouseleave .card>i": "onMouseleave",
    "click .field-hand": "onClick",
    "click .battleside.player": "onClickFieldCard",
    "click .battleside.foe": "onClickFoeFieldCard",
    "click .button-pass": "onPassing",
    "click .button-switch": "onSwitchPlayer",
    "click .button-quit": "onQuit",
    "click .field-discard": "openDiscard",
    "click .field-leader>.card-wrap": "clickLeader"
  },
  onPassing: function(){
    if (this.readOnly) return;
    if(this.user.get("passing")) return;
    if(this.user.get("waiting")) return;
    this.user.set("passing", true);
    this.user.get("app").send("set:passing");
    this.user.get("app").trigger("timer:cancel");
  },
  canSwitchPlayer: function() {
    return this.readOnly || util.isDramaMode();
  },
  onSwitchPlayer: function() {
    if (!this.canSwitchPlayer()) return;
    // switch side name
    let roomSide = this.user.get("roomSide");
    let roomFoeSide = this.user.get("roomFoeSide");
    this.user.set("roomSide", roomFoeSide);
    this.user.set("roomFoeSide", roomSide);
    // switch side data
    let infoData = this.yourSide.infoData;
    let leader = this.yourSide.leader;
    let field = this.yourSide.field;
    this.yourSide.infoData = this.otherSide.infoData;
    this.yourSide.leader = this.otherSide.leader;
    this.yourSide.field = this.otherSide.field;
    this.yourSide.isNearSide = !this.yourSide.isNearSide;
    this.otherSide.infoData = infoData;
    this.otherSide.leader = leader;
    this.otherSide.field = field;
    this.otherSide.isNearSide = !this.otherSide.isNearSide;
    let temp = this.handCards;
    this.handCards = this.otherHandCards || this.handCards;
    this.otherHandCards = temp;
    this.render();
  },
  onQuit: function() {
    this.isReplay = false; // stop replaying
    this.user.get("app").send("request:quitGame");
    this.user.get("app").trigger("timer:cancel");
    this.stopListening();
    this.app.reinitialize();
    this.app.goBack();
  },
  onClick: function(e){
    if (this.readOnly) return;
    if(!!this.user.get("waiting")) return;
    if(!!this.user.get("passing")) return;

    let self = this;
    let $card = $(e.target).closest(".card");
    if (!$card.length) return;
    let id = $card.data("id");
    let key = $card.data("key");

    this.app.trigger("timer:cancel"); // cancel timer
    if(!!this.user.get("setAgile")){
      if(id === this.user.get("setAgile")){
        this.user.set("setAgile", false);
        this.app.send("cancel:agile");
        this.render();
      }
      return;
    }
    if(this.user.get("setHorn") != null && this.user.get("setHorn") !== false){
      if(id === this.user.get("setHorn")){
        this.user.set("setHorn", false);
        this.app.send("cancel:horn");
        this.render();
      }
      return;
    }
    if(this.user.get("waitForDecoy") != null && this.user.get("waitForDecoy") !== false){
      if(id === this.user.get("waitForDecoy")){
        this.user.set("waitForDecoy", false);
        this.app.send("cancel:decoy");
        this.render();
      }
      return;
    }

    this.app.send("play:cardFromHand", {
      id: id
    });
    // if this is the last card, pass automatically
    // if (self.$el.find(".field-hand").find('.card').length === 1 &&
    //   !$card.data("ability").includes("medic") &&
    //   !$card.data("ability").includes("commanders_horn_card") &&
    //   !$card.data("ability").includes("attack") &&
    //   !$card.data("ability").includes("monaka") &&
    //   !$card.data("ability").includes("taibu") &&
    //   !$card.data("ability").includes("guard") &&
    //   !$card.data("ability").includes("decoy")) {
    //   setTimeout(function() {
    //     self.onPassing();
    //   }, 0);
    // }
    let playCard = $(".play-card-animation");
    let initialPos = this.getElementCenter($('.right-side'));
    playCard.css({
      'transform': `translate(${initialPos.x}px, ${initialPos.y}px)`,
    });
    playCard.html($card.html());
    let type = $card.data("type");
    let isSpy = $card.data("ability").includes("spy");
    let target;
    switch (type) {
      case 0:
        target = isSpy ? '.foe .field-close' : '.player .field-close';
        break;
      case 1:
        target = isSpy ? '.foe .field-range' : '.player .field-range';
        break;
      case 2:
        target = isSpy ? '.foe .field-siege' : '.player .field-siege';
        break;
      case 5:
        target = '.field-weather';
        break;
    }
    if (target) {
      let {x, y} = this.getElementCenter($(target));
      playCard.addClass("move-card");
      playCard.css({
        'transform': `translate(${x}px, ${y}px)`
      });
      setTimeout(() => {
        let {x, y} = this.getElementCenter($('.right-side'));
        playCard.removeClass("move-card")
        playCard.css({
          'transform': `translate(${x}px, ${y}px)`,
        });
      }, 200);
    }


    if(key === "decoy" || key === "tubakun"){
      //console.log("its decoy!!!");
      this.user.set("waitForDecoy", id);
      this.render();
    }
    if(key === "pool" || key === "daikichiyama") {
      $('.sunray-animation').addClass("sunray-animation-visible");
      setTimeout(() => {
        $('.sunray-animation').removeClass("sunray-animation-visible");
      }, 500);
    }
  },
  onClickFoeFieldCard: function(e) {
    if (!!this.user.get("chooseAttack")) {
      let $card = $(e.target).closest(".card");
      if(!$card.length) return;
      let _id = $card.data("id");
      if($card.parent().hasClass("field-horn")) return;
      this.app.send("attack:chooseAttack", {
        cardID: _id,
        attackPower: Number(this.user.get("chooseAttack").attackPower),
        grade: this.user.get("chooseAttack").grade,
        field: this.user.get("chooseAttack").field,
      });
      this.user.set("chooseAttack", false);
    }
  },
  onClickFieldCard: function(e){
    if (!!this.user.get("chooseHeal")) {
      let $card = $(e.target).closest(".card");
      if(!$card.length) return;
      let _id = $card.data("id");
      if($card.parent().hasClass("field-horn")) return;
      this.app.send("heal:chooseHeal", {
        cardID: _id,
        healPower: Number(this.user.get("chooseHeal").healPower)
      });
      this.user.set("chooseHeal", false);
    }
    if(this.user.get("waitForDecoy") != null && this.user.get("waitForDecoy") !== false){
      let $card = $(e.target).closest(".card");
      if(!$card.length) return;
      let _id = $card.data("id");

      if($card.parent().hasClass("field-horn")) return;

      this.app.send("decoy:replaceWith", {
        cardID: _id
      })
      this.user.set("waitForDecoy", false);
    }
    if(this.user.get("setAgile")){
      let $field = $(e.target).closest(".active-field");

      //console.log($field);
      let target = $field.hasClass("field-close") ? 0 : 1;
      this.app.send("agile:field", {
        field: target
      });
      this.user.set("setAgile", false);
    }
    if(this.user.get("setHorn") != null && this.user.get("setHorn") !== false){
      let $field = $(e.target).closest(".active-field");
      if (!$field.length) return;

      //console.log($field);
      let target = $field.hasClass("field-horn-close") ? 0 : ($field.hasClass("field-horn-range") ? 1 : 2);
      this.app.send("horn:field", {
        field: target
      });
      this.user.set("setHorn", false);
    }
  },
  onMouseover: function(e){
    let target = $(e.target).closest(".card");
    // apply jump animation to non-hand card
    if (target.closest(".battleside").length || target.closest(".field-leader").length) {
      target.addClass("jumpCard");
    }
    var hasPreviewB = target.parent().hasClass("preview-b");

    this.user.set("showPreview", new Preview({key: target.data().key, previewB: hasPreviewB}));
  },
  onMouseleave: function(e){
    let target = $(e.target).closest(".card");
    // remove jump animation from card
    if (target && target.length) {
      target.removeClass("jumpCard");
    }
    this.user.get("showPreview").remove();
    this.user.set("showPreview", null);
  },
  openDiscard: function(e){
    let $discard = $(e.target).closest(".field-discard");
    //console.log("opened discard");
    let side;
    if($discard.parent().hasClass("player")){
      side = this.yourSide;
    }
    else {
      side = this.otherSide;
    }
    this.user.set("openDiscard", {
      discard: side.infoData.discard,
      name: side.infoData.name
    });
  },
  render: function(){
    let self = this;
    if (self.waitForAnimation) {
      return;
    }
    let isSetHorn = self.user.get("setHorn") != null && self.user.get("setHorn") !== false;
    this.$el.html(this.template({
      cards: self.handCards,
      active: {
        close: self.user.get("setAgile") || isSetHorn,
        range: self.user.get("setAgile") || isSetHorn,
        siege: isSetHorn
      },
      isWaiting: self.user.get("waiting"),
      playerRemained: self.yourSide ? self.yourSide.infoData.deck : 0,
      foeRemained: self.otherSide ? self.otherSide.infoData.deck : 0,
      messages: self.messages,
      theme: self.user.get("theme")
    }));
    if(!(this.otherSide && this.yourSide)) return;
    this.otherSide.render();
    this.yourSide.render();


    if(this.handCards){
      this.calculateMargin(this.$el.find(".handcard-wrap"), 10);
    }

    if(this.user.get("isReDrawing")){
      this.user.set("handCards", this.handCards);
      let modal = new ReDrawModal({model: this.user});
      this.$el.prepend(modal.render().el);
    }
    if(this.user.get("openDiscard")){
      let modal = new Modal({model: this.user});
      this.$el.prepend(modal.render().el);
    }
    if(this.user.get("chooseSide")){
      let modal = new ChooseSideModal({model: this.user});
      this.$el.prepend(modal.render().el);
    }
    if(this.user.get("medicDiscard")){
      let modal = new MedicModal({model: this.user});
      this.$el.prepend(modal.render().el);
    }
    if(this.user.get("emreis_leader4")){
      let modal = new LeaderEmreis4Modal({model: this.user});
      this.$el.prepend(modal.render().el);
    }
    if(this.user.get("setAgile")){
      let id = this.user.get("setAgile");
      this.$el.find("[data-id='" + id + "']").parent().addClass("activeCard");
    }
    if(this.user.get("setHorn") != null && this.user.get("setHorn") !== false){
      let id = this.user.get("setHorn");
      this.$el.find("[data-id='" + id + "']").addClass("activeCard");
    }
    if(this.user.get("waitForDecoy") != null && this.user.get("waitForDecoy") !== false){
      let id = this.user.get("waitForDecoy");
      this.$el.find("[data-id='" + id + "']").addClass("activeCard");
    }
    let $chatWindow = $(".chat-window");
    if ($chatWindow && $chatWindow.length) {
      $chatWindow.scrollTop($chatWindow.prop("scrollHeight"));
    }
    return this;
  },
  renderPreview: function(){
    /*let preview = new Preview({key: this.user.get("showPreview")});*/
    let preview = this.user.get("showPreview");
    if(!preview){
      return;
    }
    this.$el.find(".card-preview").html(preview.render().el);
    /*this.$el.find(".card-preview").html(this.templatePreview({src: this.user.get("showPreview")}))
    this.$el.find(".card-preview").css("display", "none");
    if(this.user.get("showPreview")) {
      this.$el.find(".card-preview").css("display", "block");
    }*/
  },
  clickLeader: function(e){
    if (this.readOnly) return;
    let $card = $(e.target).closest(".field-leader");
    if(!$card.parent().hasClass("player")) return;
    if($card.find(".card").hasClass("disabled")) return;

    //console.log("click leader");


    this.app.send("activate:leader")
    this.user.get("app").trigger("timer:cancel");
  },
  updateHand: function(data) {
    let self = this;
    data.cards.forEach(c=>util.uncompress(c));
    data.cards.sort((a, b) => {
      let powerA = a._data.power + (String(a._data.ability).includes("hero") ? 100 : 0);
      let powerB = b._data.power + (String(b._data.ability).includes("hero") ? 100 : 0);
      if (powerA > powerB) return 1;
      else if (powerA < powerB) return -1;
      if (a._data.type > b._data.type) return 1;
      else if (a._data.type < b._data.type) return -1;
      return 0;
    });
    if(this.user.get("roomSide") == data._roomSide){
      self.handCards = data.cards;
    } else {
      // just for replay
      self.otherHandCards = data.cards;
    }
  },
  updateField: function(data) {
    let self = this;

    data.close && data.close.cards.forEach(c=>util.uncompress(c));
    data.ranged && data.ranged.cards.forEach(c=>util.uncompress(c));
    data.siege && data.siege.cards.forEach(c=>util.uncompress(c));
    data.weather && data.weather.cards.forEach(c=>util.uncompress(c));

    let _side = data._roomSide;

    let side = self.yourSide;
    if(this.user.get("roomSide") != _side){
      side = self.otherSide;
    }
    side.field.close = data.close;
    side.field.ranged = data.ranged;
    side.field.siege = data.siege;
    side.field.weather = data.weather;
  },
  updateInfo: function(data) {
    let self = this;

    data.info.discard && data.info.discard.forEach(c=>util.uncompress(c));

    let _side = data._roomSide;
    let infoData = data.info;
    let leader = data.leader;

    let side = self.yourSide;
    if(this.user.get("roomSide") != _side){
      side = self.otherSide;
    }
    side.infoData = infoData;
    side.leader = leader;
  },
  setUpBattleEvents: function(){
    let self = this;
    let user = this.user;
    let app = user.get("app");

    app.on("new:round", function() {
      self.recordGameEvent("new:round");
      playSound("smash");
      self.yourSide.onNewRound();
      self.otherSide.onNewRound();
    })
    app.on("update:allInfo", function(allInfo){
      self.recordGameEvent("update:allInfo", allInfo);
      for (let data of allInfo) {
        let info = {
          _roomSide: data._roomSide,
          info: data.info,
          leader: data.leader,
        };
        self.updateInfo(info);
      }
      self.render();
      for (let data of allInfo) {
        let hand = {
          _roomSide: data._roomSide,
          cards: data.cards,
        };
        self.updateHand(hand);
        let fields = {
          _roomSide: data._roomSide,
          close: data.close,
          ranged: data.ranged,
          siege: data.siege,
          weather: data.weather
        };
        self.updateField(fields);
      }
      self.render();
    })

    app.on("update:hand", function(data){
      self.updateHand(data);
    })

    app.on("update:info", function(data){
      self.updateInfo(data);
    })

    app.on("update:fields", function(data){
      self.updateField(data);
    })

    app.on("reDrawFinished", function() {
      if (localStorage.getItem("skipBattleGuide") || !self.user.get("withBot")) {
        return;
      }
      localStorage.setItem("skipBattleGuide", true);
      self.waitForAnimation = true;
      setTimeout(() => {
        introJs()
          .setOption('showStepNumbers', false)
          .setOption('disableInteraction', true)
          .setOption('exitOnOverlayClick', false)
          .setOption('highlightClass', 'intro-highlight')
          .onexit(() => {
            self.waitForAnimation = false;
            self.render();
          })
          .start();
      }, 500);
    })

    app.on("set:waiting", function(data) {
      self.recordGameEvent("set:waiting", data);
      let waiting = data.waiting;
      if (!waiting && !self.user.get("withBot") && !self.readOnly) {
        app.trigger("timer:start");
      }
      self.user.set("waiting", waiting);
    });

    app.on("set:passing", function(data) {
      self.recordGameEvent("set:passing", data);
      self.user.set("passing", data.passing);
    });

    app.on("notification", function(data) {
      self.recordGameEvent("notification", data);
      if (self.isReplay) {
        new Notification(data).render();
      }
      if (data.options && data.options.chat) {
        self.messages.push(i18n.getText(data.msgKey, data.values));
      }
    });

    app.on("gameover", function(data) {
      self.recordGameEvent("gameover", data);

      let winner = data.winner;
      if (winner === self.user.get("name")) {
        playSound("win");
      } else {
        playSound("smash");
      }
      let p1Scores = data.p1Scores;
      let p2Scores = data.p2Scores;
      p1Scores[2] = p1Scores[2] || 0;
      p2Scores[2] = p2Scores[2] || 0;

      let json = self.toGameRecordJson(self.gameRecords);
      let blob = new Blob([json], {type: "application/json"});
      let downloadUrl = URL.createObjectURL(blob);
      let downloadName = new Date().toLocaleString() + ".kumiko";

      let model = Backbone.Model.extend({});
      let modal = new WinnerModal({model: new model({
        app: app,
        user: self.user,
        winner: winner || i18n.getText("no_one"),
        gameResult: data.gameResult,
        p1_1: p1Scores[0],
        p2_1: p2Scores[0],
        p1_win_1: p1Scores[0] >= p2Scores[0],
        p2_win_1: p1Scores[0] <= p2Scores[0],
        p1_2: p1Scores[1],
        p2_2: p2Scores[1],
        p1_win_2: p1Scores[1] >= p2Scores[1],
        p2_win_2: p1Scores[1] <= p2Scores[1],
        p1_3: p1Scores[2],
        p2_3: p2Scores[2],
        p1_win_3: p1Scores[2] > 0 && p1Scores[2] >= p2Scores[2],
        p2_win_3: p2Scores[2] > 0 && p1Scores[2] <= p2Scores[2],
        downloadUrl,
        downloadName,
      })});
      $(".container").prepend(modal.render().el);
    })

  },
  recordGameEvent: function(event, data) {
    if (this.isRecording) {
      let copy = !data ? data : JSON.parse(JSON.stringify(data));
      if (event === "gameover") {
        delete copy.gameResult;
      }
      this.gameRecords.push({
        event,
        data: copy,
        timestamp: new Date().getTime(),
      });
    }
  },
  toGameRecordJson: function(gameRecords) {
    let result = {
      version: "1.1.0",
      gameRecords: gameRecords,
      side: this.user.get("roomSide"),
      foeSide: this.user.get("roomFoeSide"),
      withBot: this.user.get("withBot"),
    }
    return JSON.stringify(result, null, 2);
  },
  startReplay: function() {
    let self = this;
    let step = 0;
    let lastTimestamp;
    function next() {
      if (!self.isReplay) return;
      if (step >= self.gameRecords.length) return;
      let record = self.gameRecords[step];
      if (!lastTimestamp) lastTimestamp = record.timestamp;
      let interval = Math.min(2000, record.timestamp - lastTimestamp);
      setTimeout(function() {
        self.app.trigger(record.event, record.data);
        lastTimestamp = record.timestamp;
        step++;
        next();
      }, interval);
    }
    next();
  },
  calculateMargin: function($container, minSize){
    minSize = typeof minSize === "number" && minSize >= 0 ? minSize : 6;
    var Class = $container.find(".card-wrap").length ? ".card-wrap" : ".card";
    var n = $container.children().size();
    let w = $container.width(), c = $container.find(Class).outerWidth(true);
    let res;
    if(n < minSize)
      res = 0;
    else {
      res = -((w - c) / (n - 1) - c) + 1;
    }

    $container.find(Class).not(Class+":first-child").css("margin-left", -res);
  },
  getElementCenter: function($el) {
    let offset = $el.offset();
    let width = $el.outerWidth();
    let height = $el.outerHeight();
    return {
      x: offset.left + width / 2,
      y: offset.top + height / 2
    };
  }
});

let MedicModal = Modal.extend({
  template: require("../../templates/modal.medic.handlebars"),
  events: {
    "click .card": "onCardClick"
  },
  onCardClick: function(e){
    //console.log($(e.target).closest(".card"));
    let id = $(e.target).closest(".card").data().id;
    this.model.get("app").send("medic:chooseCardFromDiscard", {
      cardID: id
    })
    this.model.set("medicDiscard", false);
  },
  cancel: function(){
    this.model.get("app").send("medic:chooseCardFromDiscard")
    this.model.set("medicDiscard", false);
  }
});

let LeaderEmreis4Modal = Modal.extend({
  template: require("../../templates/modal.emreis_leader4.handlebars"),
  events: {
    "click .card": "onCardClick"
  },
  onCardClick: function(e){
    let id = $(e.target).closest(".card").data().id;
    this.model.get("app").send("emreis_leader4:chooseCardFromDiscard", {
      cardID: id
    })
    this.model.set("emreis_leader4", false);
  },
  cancel: function(){
    this.model.get("app").send("emreis_leader4:chooseCardFromDiscard")
    this.model.set("emreis_leader4", false);
  }
});

let ReDrawModal = Modal.extend({
  template: require("../../templates/modal.redraw.handlebars"),
  initialize: function(){
    this.listenTo(this.model, "change:isReDrawing", this.cancel);
  },
  events: {
    "click .card": "onCardClick"
  },
  onCardClick: function(e){
    //console.log($(e.target).closest(".card"));
    let id = $(e.target).closest(".card").data().id;
    this.model.get("app").send("redraw:reDrawCard", {
      cardID: id
    })
  },
  cancel: function(){
    if(!this.model.get("isReDrawing")) return;
    this.model.get("app").send("redraw:close_client");
    this.model.get("app").trigger("reDrawFinished");
    this.model.set("isReDrawing", false);
  }
});

let ChooseSideModal = Modal.extend({
  template: require("../../templates/modal.side.handlebars"),
  events: {
    "click .btn": "onBtnClick"
  },
  beforeCancel: function(){
    return false;
  },
  onBtnClick: function(e){
    var id = $(e.target).data().id;

    this.model.set("chooseSide", false);
    if(id === "you"){
      //this.model.set("chosenSide", this.model.get("roomSide"));
      this.model.chooseSide(this.model.get("roomSide"));
      this.remove();
      return;
    }
    //this.model.set("chosenSide", this.model.get("roomFoeSide"));
    this.model.chooseSide(this.model.get("roomFoeSide"));
    this.remove();
  }
});

let WinnerModal = Modal.extend({
  template: require("../../templates/modal.winner.handlebars"),
  events: {
    "click .startMatchmaking": "onBtnClick",
    "click .downloadGameRecord": "onDownloadClick",
  },
  onBtnClick: function(e) {
    this.remove();
    let gameResult = this.model.get("gameResult") || {};
    if (gameResult.questState && gameResult.questState.completed) {
      let contestReport = new ContestResultModal({
        app: this.model.get("app"),
        user: this.model.get("user"),
        gameResult: gameResult,
      });
      $(".container").prepend(contestReport.render().el);
    } else if (gameResult.newCard && gameResult.newCard.length ||
      gameResult.coins || gameResult.trophy) {
      let luckyDraw = new LuckyDraw({
        app: this.model.get("app"),
        gameResult,
      });
      $(".container").prepend(luckyDraw.render().el);
    } else {
      this.model.get("app").reinitialize();
      this.model.get("app").goBack();
    }
  },
  onDownloadClick: function() {
  },
  beforeCancel: function() {
    return false;
  }
});

module.exports = BattleView;
