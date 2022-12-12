import { Rule } from '@kilroy-code/rules/index.mjs';
import { getKey } from '@kilroy-code/api-keys/index.mjs';
import { simulateVisibility } from '@kilroy-code/hidden-tab-simulator/index.mjs';
import { delay } from '@kilroy-code/utilities/delay.mjs';
import { Croquet } from '@kilroy-code/utilities/croquet.mjs';
import { Ruled, CroquetBlock as Block, CroquetModel } from '../index.mjs';
Croquet.App.root = false; // Disable the default Croquet overlay so we can see Jasmine report from start to finish.

describe('Croquet Block', function () {
  let detachedViews = 0,
      destroyedModels = 0;
  class CountingBlock extends Block {
    detach() { super.detach(); detachedViews++; }
  }
  class CountingModel extends CroquetModel {
    destroy() { super.destroy(); destroyedModels++; }
  }
  CountingModel.register('CountingModel');
  describe('connected', function () {
    let blocks = [],
	basicOptions = {
	  appId: "com.ki1r0y.block",
	  name: Math.random().toString(), // In general, these tests assume a fresh session.
	  password: "secret",
	  autoSleep: 0.1,
	  rejoinLimit: 0.1,
	  model: CountingModel, view: CountingBlock
	},
	specOptions,
	testSpec = {specs: [{name: 'childA', x: 1}, {name:'childB', y: 2}]},
	props; // Used to test model registration. Done here so as not to create three different classes inside of runTests().
    class Registered extends Ruled {
      initialize(args) {
	props = args;
	super.initialize(args);
	return this;
      }
    }
    Block.register(Registered, {ruleNames: []});
    beforeAll(async function () {
      basicOptions.apiKey = await getKey('croquet');
    });

    function runTests(label, online = true) {
      // These tests are executed on a rootBlock that may be in various states (e.g., connected or not).
      // That is, these tests check the expected invariants regardless of connection state.
      //
      // If additional rootBlocks are supplied, it indicates other connected sessions in the same browser, illustrating that
      // changes propogate to all participants.
      //
      // Note that blocks is an array that is not yet filled in when tests are defined, but gets filled in before they run.

      let initialSpec;
      function getChildA(parentBlock) { return parentBlock.template.getChild('childA').block; }
      function getChildB(parentBlock) { return parentBlock.template.getChild('childB').block; }
      function getFirstParentBlock() { return blocks[0]; }
      function getLastParentBlock() { return blocks[blocks.length - 1]; } // Same as blockRootUser1 if only blocks.length === 1
      function getFirstChildBlock() { return getChildA(getFirstParentBlock()); }
      function getLastChildBlock() { return getChildA(getLastParentBlock()); }
      beforeAll(function () { // Setup the above vars.
	initialSpec = Object.assign({}, blocks[0].fullSpec); // capture a copy
	blocks.forEach(block => expect(block.fullSpec).toEqual(initialSpec)); // If there are others, make sure they match before we start the actual tests.
      });
      afterAll(async function () {
	// The actions in these tests are constructed so as to provide no net change, so that the blocks can be re-used between tests.
	blocks.forEach(block => expect(block.fullSpec).toEqual(initialSpec));
	await Promise.all(blocks.map(block => block.leave()));
	expect(blocks.some(block => block.isOnline)).toBeFalsy();
      });
      describe('internal machinery', function () {
	function run(checks) {
	  blocks.forEach(parentBlock => checks(parentBlock, getChildA(parentBlock), getChildB(parentBlock)));
	}
	describe('specs', function () {
	  // Block.spec === CroquetModel.spec (if connected), and
	  // parent.referenceToChild.spec === child.spec
	  // The are === so that changes to one effects the other.
	  it('block specs of parent are made up of specs of children.', function () {
	    run((parentBlock, blockA, blockB) => {
	      expect(parentBlock.fullSpec.specs[0]).toEqual(blockA.fullSpec);
	      expect(parentBlock.fullSpec.specs[1]).toEqual(blockB.fullSpec);
	    });
	  });
	  it('block specs are the same as the internal croquet Spec.', function () {
	    run((parentBlock, blockA, blockB) => {
	      if (parentBlock.isOnline) {
		expect(parentBlock.spec).toEqual(parentBlock.messenger.viewModel.spec);
		expect(blockA.spec).toEqual(blockA.messenger.viewModel.spec);
		expect(blockB.spec).toEqual(blockB.messenger.viewModel.spec);
	      } else {
		//expect(parentBlock.synchronizer).toBe(parentBlock); // TODO offline usage is not yet supported.
	      }
	    });
	  });
	});
	it('block model is equal to models of children.', function () {
	  run((parentBlock, blockA, blockB) => {
	    expect(parentBlock.blockChildren).toEqual([blockA, blockB]);

	    expect(parentBlock.template.getChild('childA')).toEqual(blockA.template);
	    expect(parentBlock.template.getChild('childB')).toEqual(blockB.template);

	    expect(parentBlock.template.getChild('childA').block).toBe(blockA);
	    expect(parentBlock.template.getChild('childB').block).toBe(blockB);	    
	  });
	});
      });
      describe('API', function () {
	describe('model registration', function () {
	  beforeEach(function () {
	    props = false;
	  });
	  it('constructs type, which is not then given to constructor.', function () {
	    let model = Block.createTemplate({type: 'Registered'});
	    expect(props).toEqual({});
	    expect(model).toBeInstanceOf(Registered);
	  });
	  it('constructs with specified properties except type.', function () {
	    let model = Block.createTemplate({a: 1, type: 'Registered', b: "foo"});
	    expect(props).toEqual({a: 1, b: "foo"});
	    expect(model).toBeInstanceOf(Registered);
	  });
	  it('prohibits construction of unregistered types.', function () {
	    expect(function() { return Block.createTemplate({type: 'NotRegistered'}); }).toThrowError();
	  });
	});
	describe('children', function () {
	  it('templates can be retrieved by name.', function () {
	    blocks.forEach(block => expect(block.template.getChild('childA')).toBeDefined());
	  });
	  it('blocks themselves do not have child properties.', function () {
	    blocks.forEach(block => expect(block.childA).toBeUndefined());
	  });
	});
	describe('property changes', function () {
	  it('has template property.', function () {
	    expect(getFirstParentBlock().template).toBeTruthy();
	  });
	  it('adds, changes, and removes properties.', async function () {
	    let firstParent = getFirstParentBlock(),
		lastParent = getLastParentBlock(),
		firstChild = getFirstChildBlock(),
		lastChild = getLastChildBlock();
	    expect(firstParent.template.someKey).toBeUndefined();

	    firstParent.template.someKey = 3; // Create it.
	    await firstParent.ready;
	    expect(firstParent.template.someKey).toBe(3);
	    await delay(); // Using delay here for message to propogate to all replicants.
	    blocks.forEach(block => expect(block.template.someKey).toBe(3));

	    lastParent.template.someKey = 99; // Change it, maybe from a different user.
	    await lastParent.ready;
	    await delay();
	    blocks.forEach(block => expect(block.template.someKey).toBe(99));

	    lastParent.template.someKey = undefined; // Remove it.
	    await lastParent.ready;
	    await delay();
	    blocks.forEach(block => expect(block.template.someKey).toBeUndefined());

	    // And in children:
	    firstChild.template.someKey = 4; // Create it.
	    await firstChild.ready;
	    expect(firstChild.template.someKey).toBe(4);
	    await delay();
	    blocks.forEach(block => expect(getChildA(block).template.someKey).toBe(4));

	    lastChild.template.someKey = 5; // Change it.
	    await lastChild.ready;
	    expect(lastChild.template.someKey).toBe(5);
	    await delay();
	    blocks.forEach(block => expect(getChildA(block).template.someKey).toBe(5));

	    firstChild.template.someKey = undefined; // Remove it.
	    await firstChild.ready;
	    await delay();
	    blocks.forEach(block => expect(getChildA(block).template.someKey).toBeUndefined());
	  });
	  it('counts multiple rapid sends.', async function () {
	    let p = 0, c = 0;
	    function sendParent(n) {
	      for (let i = 0; i < n; i++) getFirstParentBlock().template.counter = ++p;
	    }
	    function sendChild(n) {
	      for (let i = 0; i < n; i++) getFirstChildBlock().template.counter = ++c;
	    }
	    sendParent(4);
	    sendChild(5);
	    sendParent(6);
	    await Promise.all([getFirstParentBlock().ready, getFirstChildBlock().ready]);
	    expect(getFirstParentBlock().template.counter).toBe(p);
	    expect(getFirstChildBlock().template.counter).toBe(c);
	    await delay();
	    blocks.forEach(block => expect(getFirstParentBlock().template.counter).toBe(p));
	    blocks.forEach(block => expect(getFirstChildBlock().template.counter).toBe(c));
	    // Now clean up from test.
	    getFirstParentBlock().template.counter = undefined;
	    getFirstChildBlock().template.counter = undefined;
	    await Promise.all([getFirstParentBlock().ready, getFirstChildBlock().ready]);
	    await delay();
	  });
	  it('sends all messages, even when we get throttled.', async function () {
	    let p = 0, c = 0, block = getFirstParentBlock();
	    function sendParent(n) {
	      for (let i = 0; i < n; i++) block.template.counter = ++p;
	    }
	    sendParent(100);
	    await block.ready;
	    expect(block.template.counter).toBe(p);
	    // cleanup
	    block.template.counter = undefined;
	    await block.ready;
	    await delay();
	  });
	});
	describe('dynamic children', function () {
	  let addedBlockToParent, addedBlockToChild, startDestroyed, startDetached;
	  beforeAll(async function () {
	    startDestroyed = destroyedModels;
	    startDetached = detachedViews;
	    let parent1 = getFirstParentBlock(),
		parent2 = getFirstChildBlock();
	    let allReady = [parent1.ready, parent2.ready];
	    parent1.template.specs = [{name: 'added', x: 1, y: "b"}];
	    parent2.template.specs = [{name: 'added', type: 'Registered', x: 11, y: "bb"}];
	    await Promise.all(allReady);
	    addedBlockToParent = parent1.template.getChild('added').block;
	    addedBlockToChild = parent2.template.getChild('added').block;
	    await delay(); // And a delay for other replicants.
	  });
	  afterAll(async function () {
	    let parent1 = getFirstParentBlock(),
		added1 = parent1.template.getChild('added').block,
		parent2 = getFirstChildBlock(),
		added2 = parent2.template.getChild('added').block,

		lastParent2 = getLastChildBlock(),
		lastAdded2 = lastParent2.template.getChild('added').block;

	    let allReady = [added1.ready, added2.ready];
	    added1.template.parent = null;
	    added2.template.parent = null;
	    await Promise.all(allReady);
	    expect(added1.template.parent).toBe(null);
	    expect(added2.template.parent).toBe(null);	    
	    expect(parent1.template.getChild('added')).toBeUndefined();
	    expect(parent2.template.getChild('added')).toBeUndefined();	    

	    await delay(); // Check another replicant.
	    expect(lastAdded2.template.parent).toBe(null);	    
	    expect(lastParent2.template.getChild('added')).toBeUndefined();
	    
	    expect(destroyedModels - startDestroyed).toBe(2 * blocks.length);
	    expect(detachedViews - startDetached).toBe(2 * blocks.length);
	  });
	  it('added child is as connected as the parent.', function () {
	    const rootTemplate = getFirstParentBlock().template;
	    expect(addedBlockToParent.template.parent).toBe(rootTemplate);
	    expect(addedBlockToChild.template.parent.parent).toBe(rootTemplate);
	  });
	  it('adds registered type as child.', async function () {
	    let parentAddedModel = getLastParentBlock().template.getChild('added'),
		childAddedModel = getLastChildBlock().template.getChild('added');
	    expect(parentAddedModel.x).toBe(1);
	    expect(parentAddedModel.y).toBe("b");

	    expect(childAddedModel.x).toBe(11);
	    expect(childAddedModel.y).toBe("bb");
	  });
	  it('references through model child properties also detect modifications.', async function () {
	    let ready = addedBlockToChild.ready;
	    addedBlockToChild.template.more = 99;
	    await ready;
	    expect(addedBlockToChild.template.more).toBe(99);
	    await delay(); // Check same thing in another replicant.
	    expect( getLastChildBlock().template.getChild('added').more ).toBe(99);
	  });
	  // TODO: change a property on a child that will have been removed by the time the message is reflected.
	  //       same for removing a child already removed
	  /* TODO, maybe. Not yet supported:
	  xdescribe('path', function () {
	    it('is available.', function () {
	      expect(getFirstParentBlock().path).toBe('/');
	      expect(addedBlockToChild.path).toBe('/childA/added/');
	    });
	    it('can be used for lookup.', function () {
	      let root = getFirstParentBlock();
	      expect(root.find(root.path)).toBe(root);
	      expect(addedBlockToChild.find(root.path)).toBe(root);

	      expect(root.find(addedBlockToChild.path)).toBe(addedBlockToChild);
	      expect(addedBlockToChild.find(addedBlockToChild.path)).toBe(addedBlockToChild);
	    });
	  });
	  */
	});
	describe('offline toggle', function () {
	  function afterOnline() {
	    // Session is the same after coming back online, but the blocks list we grabbed earlier is not.
	    // TODO: Offline usage is not yet supported. When we do, this won't be necessary.
	    blocks = blocks.map(oldBlock => oldBlock.cachedSession.view.block);
	  }
	  async function goOffline() {
	    // I'd rather contort things (here and goOnline and visibilityChange) to just take one offline...
	    //await blocks[0].leave();
	    // ...but my croquet-in-memory implementation isn't robust enough.
	    await Promise.all(blocks.map(block => block.leave()));
	  }
	  async function goOnline() {
	    //blocks = await Promise.all(blocks.map(block => block.join(specOptions))); // TODO: when we have offline usage, something like this would be used instead.
	    blocks = await Promise.all(blocks.map(block => Block.create(specOptions)));
	  }
	  function checkOffline() {
	    blocks.forEach(block => expect(block.isOnline).toBeFalsy());
	  }
	  function checkOnline(label) {
	    blocks.forEach(block => expect(block.isOnline && label).toBe(label));
	  }
	  async function visibilityChange(visibility) {
	    const promise = blocks.map(block => block.pauseChange),
		  start = Date.now();
	    await simulateVisibility(visibility);
	    const state = await Promise.all(promise);
	    console.log(`${label} ${state[0]} recognized in ${Date.now() - start} ms.`);
	  }
	  let dummy = 'while offline';
	  beforeAll(async function () {
	    if (online) return;
	    await goOnline();
	  });
	  afterAll(async function () {
	    if (online) return;
	    await goOffline();
	  });
	  it('stops and starts.', async function () {
	    checkOnline('initial');

	    await visibilityChange('hidden');
	    checkOffline();
	    // TODO: when we make visibilityChange work on just on of the replicants, have the remaining set
	    // a value, add a child, delete a different child, and confirm that the paused one catches up (viewModel,
	    // blocks, & template) when resumed.

	    await visibilityChange('visible');
	    afterOnline();
	    checkOnline('after hidden');

	    /* TODO: Do we require id to be stable across invocations of the same session,
	       and do we have a way to look them up? If so...
	       // Finds by id IFF blocks we're online.
	       let root = getFirstParentBlock(),
	       child = root.blockChildren[0];
	       expect(root.find(root.id)).toBe(root);
	       expect(child.find(root.id)).toBe(root);
	       expect(root.find(child.id)).toBe(child);
	       expect(child.find(child.id)).toBe(child);
	    */
	    await goOffline();
	    /* TODO: when we support offline activty...
	       checkOffline();
	       getFirstChildBlock().template.someKey = dummy;
	       await getFirstChildBlock().ready;
	       expect(getFirstChildBlock().template.someKey).toBe(dummy);
	       // TODO: create a new child and set a value there - in BOTH the online and offline cases (different child/value).
	       // TODO: delete a child that existed when we were online and set a value there.
	       */
	    await goOnline();
	    checkOnline('after leave');
	    await delay();
	    // blocks.forEach(root => expect(getChildA(root).template.someKey).toBe(dummy)); // TODO: when we do offline activity.
	    getFirstChildBlock().template.someKey = undefined;
	    await getFirstChildBlock().ready;
	    await delay();
	  });
	});
      });
    }
    function setOptions(label) {
      specOptions = Object.assign({}, {options: Object.assign({name:label}, testSpec)}, basicOptions)
      specOptions.name += label; // Different sessions for different labels.
    }
    describe('online', function () {
      beforeAll(async function () {
	setOptions('online');
	blocks = [await Block.create(specOptions)];
      });
      runTests('online');
    });
    describe('with multiple participants', function () {
      beforeAll(async function () { // Get a list of blocks joined to the same spec.
	setOptions('multi');
	blocks = await Promise.all([specOptions, specOptions].map(spec => Block.create(spec)));
      });
      runTests('multi');
    });
    /* // TDOO: not supported yet.
    xdescribe('offline', function () {
      beforeAll(function () {
	setOptions('offline');
	blocks = [new Block(testSpec)];
      });
      runTests('offline', false);
    });
    */
  });
});
