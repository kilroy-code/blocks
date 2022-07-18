import { Block } from '../index.mjs';
import { getKey } from '../../api-key/index.mjs';

function tick(ms = 50) {
  // When there are two participants in the same session, there is no guarantee that they will step together.
  // This delay allows each session time to receive and act on messages.
  return new Promise(resolve => setTimeout(resolve, ms));
}

Croquet.App.root = false; // Disable the default Croquet overlay so we can see Jasmine report from start to finish.
describe('Block', function () {
  let croquetOptions;
  beforeAll(async function () {
    let apiKey = await getKey('croquet');
    croquetOptions = {
      appId: "com.ki1r0y.block",
      name: Math.random().toString(), // In general, these tests assume a fresh session.
      apiKey,
      password: "secret",
    };
  });
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
  describe('creates a registered model', function () {
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
    it('based on type, which is not then given to constructor.', function () {
      let model = Block.createModel({type: 'Registered'});
      expect(props).toEqual({});
      expect(model).toBeInstanceOf(Registered);
    });
    it('with the specified properties except type.', function () {
      let model = Block.createModel({a: 1, type: 'Registered', b: "foo"});
      expect(props).toEqual({a: 1, b: "foo"});
      expect(model).toBeInstanceOf(Registered);
    });
    it('error for unregistered types.', function () {
      expect(function() { return Block.createModel({type: 'NotRegistered'}); }).toThrowError();
    });
  });
  describe('with model.display', function () {
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
  xdescribe('with no session', function () {
  });
  describe('with session', function () {
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 10000;
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
      blockA.model.foo = 17;
      await blockA.ready;
      expect(blockA.model.foo).toBe(17);
      await tick();
      expect(blockB.model.foo).toBe(17);

      blockB.model.foo = 42;
      await blockB.ready;
      expect(blockB.model.foo).toBe(42);
      await tick();
      expect(blockA.model.foo).toBe(42);

      blockA.model.foo = undefined;
      await blockA.ready;
      expect(blockA.model.foo).toBe(undefined);
      await tick();
      expect(blockB.model.foo).toBe(undefined);
    });
  });
  it('smokes', async function (/*done*/) {
    let block = await Block.join(croquetOptions);
    block.model.baz = 99;
    block.model.foo = 17;
    block.model.bar = 42;
    block.model.baz = undefined;
    await block.ready;

    expect(block.model.foo).toBe(17);
    const spec = block.spec;
    expect(JSON.stringify(spec)).toBe('{"foo":17,"bar":42}');
    await block.leave();
    if (Block.Croquet.fake) croquetOptions.options = spec; // Fake Croquet doesn't persist across sessions.

    block = await Block.join(croquetOptions); // ... can join and catch up.
    expect(block.model.foo).toBe(17);
    expect(JSON.stringify(block.spec)).toBe('{"foo":17,"bar":42}');
    await block.leave();
  });
});
