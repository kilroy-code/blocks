import { Block } from '../index.mjs';
import { getKey } from '../../api-key/index.mjs';

function tick(ms = 50) {
  // When there are two participants in the same session, there is no guarantee that they will step together.
  // This delay allows each session time to receive and act on messages.
  return new Promise(resolve => setTimeout(resolve, ms));
}

Croquet.App.root = false; // Disable the default Croquet overlay so we can see Jasmine report from start to finish.
describe('Block', function () {

  describe('regardless of session', function () {

    describe('with empty model', function () {
      let model = {}, block;
      beforeEach(function () { block = new Block(model); });
      it('has model property.', function () {
	expect(block.model).toBe(model);
      });
      it('can be removed.', function () {
	block.remove(); // Safe no op in this case.
	expect(block.model).toBe(model); // Does not remove model.
      });
    });

    it('has no semantics regarding parent/child.', function () {
      let model = {child: {type: 'Foo'}},
	  block = new Block(model);
      expect(block.model).toBe(model);
      expect(block.child).toBeFalsy();
    });

    describe('model registration', function () {
      let props;
      class Registered {
	constructor(args) {
	  props = args;
	}
      }
      Block.register(Registered);
      beforeEach(function () {
	props = false;
      });
      it('constructs type, which is not then given to constructor.', function () {
	let model = Block.createModel({type: 'Registered'});
	expect(props).toEqual({});
	expect(model).toBeInstanceOf(Registered);
      });
      it('constructs with specified properties except type.', function () {
	let model = Block.createModel({a: 1, type: 'Registered', b: "foo"});
	expect(props).toEqual({a: 1, b: "foo"});
	expect(model).toBeInstanceOf(Registered);
      });
      it('prohibits construction of unregistered types.', function () {
	expect(function() { return Block.createModel({type: 'NotRegistered'}); }).toThrowError();
      });
    });

    describe('display', function () {
      let model = {display: 'Displayer'}, block, displayConstructorArg, displayRemoveCalled;
      class Displayer {
	constructor(arg) {
	  displayConstructorArg = arg;
	}
	remove() {
	  displayRemoveCalled = true;
	}
      }
      Block.register(Displayer);
      beforeEach(function () {
	displayConstructorArg = false;
	displayRemoveCalled = false;
	block = new Block(model);
      });
      it('has model property.', function () {
	expect(block.model).toBe(model);
      });
      it('has display property containing an instance of the registered class.', function () {
	expect(block.display).toBeInstanceOf(Displayer);
      });
      it('calls display constructor with block.', function () {
	expect(displayConstructorArg).toBe(block);
      });
      describe('after removal', function () {
	beforeEach(function () { block.remove(); });
	it('still has model property.', function () {
	  expect(block.model).toBe(model);
	});
	it('removes display property.', function () {
	  expect(block.display).toBeFalsy();
	});
	it('calls display.remove().', function () {
	  expect(displayRemoveCalled).toBeTruthy();
	});
      });
    });
  });

  describe('with session', function () {
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 10e3;
    let croquetOptions;
    beforeAll(async function () {
      let apiKey = await getKey('croquet');
      croquetOptions = {
	appId: "com.ki1r0y.block",
	name: Math.random().toString(), // In general, these tests assume a fresh session.
	apiKey,
	password: "secret",
	autoSleep: 0.1,
	rejoinLimit: 0,
	options: {childA: {type: 'Object', x: 1}, childB: {type: 'Object', y: 2}}
      };
    });

    it('smokes', async function (/*done*/) {
      let block = await Block.join(croquetOptions);
      block.model.baz = 99;
      block.model.foo = 17;
      block.model.bar = 42;
      block.model.baz = undefined;
      await block.ready;

      expect(block.model.foo).toBe(17);
      const spec = block.spec,
	    intended = Object.assign({}, croquetOptions.options, {foo: 17, bar: 42});
      expect(spec).toEqual(intended);

      // Internal machinery invariants. FIXME: separate these tests so that it's clear what apps can do and what they should not.
      const blockA = block.synchronizer.children.childA.block,
	    blockB = block.synchronizer.children.childB.block;
      // block specs of parent are made up of specs of children.
      expect(block.spec.childA).toBe(blockA.spec);
      expect(block.spec.childB).toBe(blockB.spec);
      // block specs are the same as the internal crqouet Spec.
      expect(block.spec).toBe(block.synchronizer.croquetSpec.spec);
      expect(blockA.spec).toBe(blockA.synchronizer.croquetSpec.spec);
      expect(blockB.spec).toBe(blockB.synchronizer.croquetSpec.spec);
      // block model is made up of models of children
      expect(block.model.childA).toBe(blockA.model);
      expect(block.model.childB).toBe(blockB.model);

      await block.leave();
      if (Block.Croquet.fake) croquetOptions.options = spec; // Fake Croquet doesn't persist across sessions.
      block = await Block.join(croquetOptions); // ... can join and catch up.
      expect(block.model.foo).toBe(17);
      expect(block.spec).toEqual(intended);

      function simulateVisibility(state) {
	console.log('state:', state);
	Object.defineProperty(document, 'visibilityState', {value: state, writable: true});
	document.dispatchEvent(new Event("visibilitychange"));
      }
      simulateVisibility('hidden');
      await new Promise(resolve => setTimeout(resolve, 2e3)); // Real Croquet takes the autoSleep time plus about two seconds.
      // Internal machinery invariants.
      expect(block.synchronizer).toBeFalsy();
      expect(block.session).toBeFalsy(); // Really? Do we want that?

      simulateVisibility('visible');
      await new Promise(resolve => setTimeout(resolve, 2e3)); // Real Croquet takes the autoSleep time plus about two seconds.
      expect(block.synchronizer).toBeTruthy();
      expect(block.session).toBeTruthy();
      expect(block.spec).toEqual(intended);

      await block.leave();
      expect(block.synchronizer).toBeFalsy();
      expect(block.session).toBeFalsy();
    });

    describe('replicates', function () {
      let blockA, blockB;
      beforeAll(async function () {
	blockA = await Block.join(croquetOptions);
	blockB = await Block.join(croquetOptions);
      });
      afterAll(async function () {
	await blockA.leave();
	await blockB.leave();
      });
      it('model assignments are replicated.', async function () {
	blockA.model.foo = 17;  // User A assigns
	await blockA.ready;
	expect(blockA.model.foo).toBe(17); // A sees result.
	await tick();
	expect(blockB.model.foo).toBe(17); // And so does B.

	blockB.model.foo = 42;  // User B assigns a different value.
	await blockB.ready;
	expect(blockB.model.foo).toBe(42); // B sees result.
	await tick();
	expect(blockA.model.foo).toBe(42); // And so does A.

	blockA.model.foo = undefined; // User A resets.
	await blockA.ready;
	expect(blockA.model.foo).toBe(undefined); // A sees result.
	await tick();
	expect(blockB.model.foo).toBe(undefined); // And so does B.
      });
    });

    describe('offline', function () {
      it('captures changes for replay after coming online.', function () {
      });
    });

  });
});
