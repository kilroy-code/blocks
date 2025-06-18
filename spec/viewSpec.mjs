import { View } from '../view.mjs';

describe('Block View', function () {
  let modelId = 0,
      subscriptions = {},
      terminatedViews = 0,
      viewId = 0,
      currentSession;
  function newSession() {
    currentSession = {viewId: viewId++};
  }
  function send(scope, event, data) {
    subscriptions[scope][event](data);
  }
  class MockModel {
    children = [];
    spec = [];
    received = null;
    constructor(properties) {
      Object.assign(this, properties);
      this.id = modelId++;
    }
  }
  class MockView {
    constructor(model) {
      this.session = currentSession;
      this.viewModel = model;
      this.viewId = this.session.viewId;
      if (!this.session.rootView) this.session.rootView = this;
      this.session.leave = () => this.session.rootView.detach();
    }
    detach() {
      terminatedViews++;
    }
    get block() {
      return this._block || (this._block = new MockBlock({messenger: this}));
    }
    subscribe(scope, eventName, method) { // These tests do not cover replication to all instances of the model.
      let events = subscriptions[scope];
      if (!events) events = subscriptions[scope] = {};
      events[eventName] = method.bind(this);
    }
    publish(scope, eventName, data) { // In our usage...
      expect(scope).toBe(this.viewModel.id);
      this.viewModel.spec[data.key] = data.value;
      this.viewModel.received = [scope, eventName, data];
    }

    get viewChildren() { // Not part of the API, but convenient for testing.
      return this.block.blockChildren.map(block => block.messenger);
    }
  }
  const TestView = View(MockView);
  class MockBlock {
    messenger;
    blockChildren = [];
    template = {parent: null};
    constructor(properties) { Object.assign(this, properties); }
    setParent(parentBlock) { // Real Block is more complicated, but this covers View testing.
      if (parentBlock) parentBlock.blockChildren.push(this);
      else {
	let siblings = this.template.parent?.blockChildren;
	if (siblings) siblings.splice(siblings.indexOf(this), 1);
      }
      this.template.parent = parentBlock;
    }
    setUnderlyingValue(key, value) {
      this.template[key] = value;
    }
  }
  describe('integrateChildren', function () {
    newSession();
    let view = new TestView(new MockModel({children: [new MockModel({}), new MockModel({})]})); // Not how we create real model children.
    view.integrateChildren();
    let modelChildren = view.viewModel.children;
    let blockChildren = view.block.blockChildren;
    let viewChildren = view.viewChildren;
    it('creates views for each model.children.', function () {
      expect(viewChildren.length).toBe(2);
      expect(viewChildren[0].viewModel).toBe(modelChildren[0]);
      expect(viewChildren[1].viewModel).toBe(modelChildren[1]);
    });
    it('arranges for each view child to have the corresponding block parent set to ours.', function () {
      let parentBlock = view.block;
      blockChildren.forEach(block => expect(block.template.parent).toBe(parentBlock));
    });
  });
  describe('leave', function () {
    let startTerminated, view, startBlockChildren;
    beforeAll(async function () {
      startTerminated = terminatedViews;
      newSession();
      view = new TestView(new MockModel({children: [new MockModel({}), new MockModel({})]})); // Not how we create real model children.
      view.integrateChildren();
      startBlockChildren = view.block.blockChildren.slice();
      await view.leave();
    });
    it('detaches all views.', function () {
      expect(terminatedViews - startTerminated).toBe(3);
    });
    it('sets each block parent to null, from the root down.', function () {
      expect(startBlockChildren.length).toBe(2);
      expect(view.block.blockChildren.length).toBe(0);
      startBlockChildren.forEach(block => expect(block.template.parent).toBe(null));
    });
  });
  describe('setModelProperty', function () {
    newSession();    
    let user1view = new TestView(new MockModel({}));
    newSession();
    let user2view = new TestView(new MockModel({}));

    it('sends setSpecProperty and key/value/from, to the correct model.', function () {
      user1view.setModelProperty('y', 3);
      expect(user1view.viewModel.spec.y).toBe(3);
      expect(user1view.viewModel.received).toEqual([user1view.viewModel.id, 'setSpecProperty', {key: 'y', value: 3, from: user1view.viewId}]);
    });
    it('identifies sender by viewId', function () {
      expect(user1view.viewId).not.toBe(user2view.viewId);

      user1view.setModelProperty('x', 17);
      expect(user1view.viewModel.received).toEqual([user1view.viewModel.id, 'setSpecProperty', {key: 'x', value: 17, from: user1view.viewId}]);

      user2view.setModelProperty('x', 42);
      expect(user2view.viewModel.received).toEqual([user2view.viewModel.id, 'setSpecProperty', {key: 'x', value: 42, from: user2view.viewId}]);
    });
  });
  describe('setTemplateProperty', function () {
    newSession();
    let user1view = new TestView(new MockModel({}));
    newSession();
    let user2view = new TestView(new MockModel({}));

    it('does.', function () {
      send(user1view.viewModel.id, 'setTemplateProperty', {key: 'red', value: 255, from: user2view.viewId, viewModel: user1view.viewModel});
      expect(user1view.block.template.red).toBe(255);
    });
    it('ignores from other model/view/sessions in the same Javascript.', function () {
      send(user1view.viewModel.id, 'setTemplateProperty', {key: 'blue', value: 0, from: user2view.viewId, viewModel: user1view.viewModel});
      expect(user1view.block.template.blue).toBe(0);
      send(user1view.viewModel.id, 'setTemplateProperty', {key: 'blue', value: -1, from: user2view.viewId, viewModel: user2view.viewModel}); // wrong viewModel
      expect(user1view.block.template.blue).toBe(0);
    });
  });
  describe('sessionCachedBlocks', function () {
    newSession();
    let user1view = new TestView(new MockModel({children: [new MockModel({}), new MockModel({})]}));
    user1view.integrateChildren();
    newSession();
    let user2view = new TestView(new MockModel({}));
    it('is the same in all views in the session.', function () {
      let viewChildren = user1view.viewChildren;
      expect(user1view.sessionCachedBlocks).toBe(viewChildren[0].sessionCachedBlocks);
      expect(user1view.sessionCachedBlocks).toBe(viewChildren[1].sessionCachedBlocks);
    });
    it('is different in different sessions.', function () {
      expect(user1view.sessionCachedBlocks).not.toBe(user2view.sessionCachedBlocks);
    });
  });
});
