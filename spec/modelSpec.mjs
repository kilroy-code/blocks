import { Model } from '../model.mjs';

describe('Block model', function () {
  let created = 0,
      destroyed = 0,
      received = null,
      subscriptions = {};
  function send(scope, event, data) {
    subscriptions[scope][event](data);
  }
  class MockModel {
    static models = {};
    static create(rest) {
      const instance = new this();
      instance.init(rest);
      this.models[instance.id] = instance;
      return instance;
    }
    init() {
      this.id = created++;
    }
    destroy() {
      destroyed++;
    }
    getModel(id) {
      return this.constructor.models(id);
    }
    subscribe(scope, eventName, method) {
      let events = subscriptions[scope];
      if (!events) events = subscriptions[scope] = {};
      events[eventName] = method.bind(this);
    }
    publish(scope, eventName, argument) {
      received = [scope, eventName, argument];
    }
  }
  const TestModel = Model(MockModel);

  it('create calls super.init() and destroy calls super.destroy().', function () {
    let startCreated = created,
	startDestroyed = destroyed,
	instance = TestModel.create({});
    expect( created - startCreated     ).toBe(1);
    expect( instance.id                ).toBeDefined();
    expect( instance.spec              ).toEqual({name: 'none'}); // for empty create spec.
    instance.destroy();
    expect( destroyed - startDestroyed ).toBe(1); 
  });

  describe('specs create children that get destroyed with parent.', function () {
    let startCreated, startDestroyed, instance;
    beforeAll(function () {
      startCreated = created;
      startDestroyed = destroyed;
      instance = TestModel.create({
	name: 'parent',
	specs: [
	  {name: 'a'},
	  {name: 'b'}
	]});
      expect( created - startCreated ).toBe(3);
    });
    it('with specified name.', function () {
      expect( instance.spec.name ).toBe('parent');
    });
    it('has children with specified parent.', function () {
      expect( instance.children.map(child => child.parent) ).toEqual([instance, instance]);
    });
    it('has specified children.', function () {
      expect( instance.children.map(child => child.spec.name) ).toEqual(['a', 'b']);
      expect( instance.getChild('a').spec.name                ).toBe('a');
      expect( instance.getChild('b').spec.name                ).toBe('b');
    });
    afterAll(function () {
      instance.destroy();
      expect( destroyed - startDestroyed ).toBe(3); // all of them.
    });
  });

  describe('setSpecProperty message', function () {
    let startCreated, startDestroyed, parent, child, childName;
    beforeAll(function () {
      startCreated = created;
      startDestroyed = destroyed;
      childName = 'childName';
      parent = TestModel.create({ name: 'parent', specs: [ {name: childName } ]});
      child = parent.getChild(childName);
      expect( created - startCreated ).toBe(2);
    });
    it('sets spec and reflects back.', function () {
      send(                            parent.id, 'setSpecProperty', {key: 'x', value: 17, from: 'me'});
      expect( parent.spec.x ).toBe(17);
      expect( received      ).toEqual([parent.id, 'setTemplateProperty', {key: 'x', value: 17, from: 'me', viewModel:parent}]);
    });
    it('setting to undefined removes from spec (unless it is special).', function () {
      send(                            parent.id, 'setSpecProperty', {key: 'y', value: 42, from: 'me'});
      expect( parent.spec.y ).toBe(42);
      expect( received      ).toEqual([parent.id, 'setTemplateProperty', {key: 'y', value: 42, from: 'me', viewModel:parent}]);

      send(                            parent.id, 'setSpecProperty', {key: 'y', value: undefined, from: 'me'});
      expect( 'y' in parent.spec ).toBeFalsy();
      expect( received      ).toEqual([parent.id, 'setTemplateProperty', {key: 'y', value: undefined, from: 'me', viewModel:parent}]);
    });
    it('is separate namespace from model properties.', function () {
      let id = parent.id;
      send(                             parent.id, 'setSpecProperty', {key: 'id', value: 'fred', from: 'you'});
      expect( parent.spec.id ).toBe('fred');
      expect( parent.id      ).toBe(id);
      expect( received       ).toEqual([parent.id, 'setTemplateProperty', {key: 'id', value: 'fred', from: 'you', viewModel:parent}]);
    });
    it('is separate namespace from child names.', function () {
      send(                                           parent.id, 'setSpecProperty', {key: childName, value: 'sally', from: 'them'});
      expect( parent.spec[childName]       ).toBe('sally');      
      expect( parent.getChild(childName)   ).toBe(child);
      expect( parent.spec.sally            ).toBeUndefined();
      expect( parent.getChild('sally')     ).toBeFalsy();      
      expect( received                     ).toEqual([parent.id, 'setTemplateProperty', {key: childName, value: 'sally', from: 'them', viewModel:parent}]);
    });
    it('for name changes how child is accessed in parent.', function () {
      let oldName = childName,
	  oldDestroyed = destroyed;
      childName = 'other';
      send(                                         child.id, 'setSpecProperty', {key: 'name', value: childName, from: 'who'});
      expect( child.spec.name            ).toBe(childName);
      expect( parent.getChild(childName) ).toBe(child);
      expect( parent.getChild(oldName)   ).toBeFalsy();
      expect( received                   ).toEqual([child.id, 'setTemplateProperty', {key: 'name', value: childName, from: 'who', viewModel:child}]);      
      // The following is actually tested in the afterAll, but it's safer and more perspicuous to explicitly check here.
      expect( destroyed                  ).toBe(oldDestroyed); // i.e., we didn't destroy the child by setting is's parent to null along the way.
    });
    afterAll(function () {
      parent.destroy();
      expect( destroyed - startDestroyed ).toBe(2); // all of them.
    });
  });
});
