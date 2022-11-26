import { Block, Croquet } from '../index.mjs';

import { getKey } from '../../api-key/index.mjs';

import { Synchronizer } from '../index.mjs';
import { Assembly } from '../assembly.mjs';
import { simulateVisibility } from '../../hidden-tab-simulator/index.mjs';

function tick(ms = 50) {
  // When there are two participants in the same session, there is no guarantee that they will step together.
  // This delay allows each session time to receive and act on messages.
  return new Promise(resolve => setTimeout(resolve, ms));
}

Croquet.App.root = false; // Disable the default Croquet overlay so we can see Jasmine report from start to finish.
describe('Block', function () {
  describe('internal components', function () {
    class Entity extends Assembly(Object) {
      constructor() {
	super();
	this.assembly = this;
      }
    }
    describe('added children', function () {
      let entity, child;
      beforeAll(function () {
	entity = new Entity();
	child = new Entity();
	entity.child = 17
	entity.addChild('child', child);
      });
      it('can be retrieved by name.', function () {
	expect(entity.getChild('child')).toBe(child);
      });
      it('do not interfere with entity properties of the same name.', function () {
	expect(entity.child).toBe(17);
      });
      it('record parent.', function () {
	expect(child.parent).toBe(entity);
      });
      it('record name.', function () {
	expect(child.name).toBe('child');
      });
      it('can be iterated in order added.', function () {
	let child2 = new Entity(), results = []
	entity.addChild('child2', child2);
	entity.forEachChild((child, name) => results.push([name, child]));
	expect(results[0]).toEqual(['child', child]);
	expect(results[1]).toEqual(['child2', child2]);
      });
    });
    describe('removed children', function () {
      let entity, child1, child2, results = [];
      beforeAll(function () {
	entity = new Entity();
	child1 = new Entity();
	child2 = new Entity();
	entity.addChild('child1', child1);
	entity.addChild('child2', child2);
	entity.removeChild(child1);
      });
      it('cannot be retrieved by name.', function () {
	expect(entity.getChild('child1')).toBeFalsy();
      });
      it('have no parent.', function () {
	expect(child1.parent).toBeFalsy();
      });
      it('have no name.', function () {
	expect(child1.name).toBeFalsy();
      });
      it('are not iterated.', function () {
	entity.forEachChild((child, name) => results.push([name, child]));
	expect(results).toEqual([['child2', child2]]);
      });
    });
    describe('recording', function () {
      let block, child, recording = [], recorder = (block, key, value) => recording.push([block.name, key, value]);
      beforeAll(function () {
	block = new Block({property: 1, child: {type: 'Object', property2: "a"}}),
	child = block.getChild('child');
	block.addRecorder(recorder);
      });
      it('captures changes under the tree.', function () {
	block.model.property = 2;
	child.model.property2 = "b";
	child.model.grandchild = {type: 'Object', property3: "x"};
	block.model.property = 3;
	child.model.property2 = "c";
	child.model.grandchild.property3 = "y";
	block.model.property = undefined;
	child.model.property2 = undefined;
	// FIXME: Make playback of node creation store the newly created id, and use that in subsequent modifications.
	// This test doesn't show whether or not that is working. Fix the behavior and the test.
	expect(recording).toEqual([
	  [null, 'property', 2],
	  ['child', 'property2', "b"],
	  ['child', 'grandchild', {type: 'Object', property3: "x"}],
	  [null, 'property', 3],
	  ['child', 'property2', "c"],
	  ['grandchild', 'property3', "y"],
	  [null, 'property', undefined],
	  ['child', 'property2', undefined]
	]);
	block.removeRecorder(recorder);
	expect(block.recorders.indexOf(recorder)).toBe(-1);
	expect(child.recorders.indexOf(recorder)).toBe(-1);
	expect(child.getChild('grandchild').recorders.indexOf(recorder)).toBe(-1);
      });
    });
    // FIXME: confirm that detach/destroy works the way we expect:
    // going offline should detach all Croquet.Views (and clear block.synchronizer and synchronizer.block), but not blocks (and should set up recording).
    // removing a child should destroy all descendant blocks and detach their Croquet.Views.
  });

  describe('connected', function () {
    let blocks = [],
	basicOptions = {
	  appId: "com.ki1r0y.block",
	  name: Math.random().toString(), // In general, these tests assume a fresh session.
	  password: "secret",
	  autoSleep: 0.1,
	  rejoinLimit: 0.1,
	},
	specOptions,
	testSpec = {childA: {type: 'Object', x: 1}, childB: {type: 'Object', y: 2}},
	props; // Used to test model registration. Done here so as not to create three different classes inside of runTests().
    class Registered {
      constructor(args) {
	props = args;
      }
    }
    Block.register(Registered);
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
      function getChildA(parentBlock) { return parentBlock.getChild('childA'); }
      function getChildB(parentBlock) { return parentBlock.getChild('childB'); }
      function getFirstParentBlock() { return blocks[0]; }
      function getLastParentBlock() { return blocks[blocks.length - 1]; } // Same as blockRootUser1 if only blocks.length === 1
      function getFirstChildBlock() { return getChildA(getFirstParentBlock()); }
      function getLastChildBlock() { return getChildA(getLastParentBlock()); }

      beforeAll(function () { // Setup the above vars.
	initialSpec = Object.assign({}, blocks[0].spec); // capture a copy
	blocks.forEach(block => expect(block.spec).toEqual(initialSpec)); // If there are others, make sure they match before we start the actual tests.
      });
      afterAll(async function () {
	// The actions in these tests are constructed so as to provide no net change, so that the blocks can be re-used between tests.
	blocks.forEach(block => expect(block.spec).toEqual(initialSpec));
	await Promise.all(blocks.map(block => block.leave()));
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
	      expect(parentBlock.spec.childA).toBe(blockA.spec);
	      expect(parentBlock.spec.childB).toBe(blockB.spec);
	    });
	  });
	  it('block specs are the same as the internal croquet Spec.', function () {
	    run((parentBlock, blockA, blockB) => {
	      if (parentBlock.synchronizer.croquetModel) {
		expect(parentBlock.spec).toBe(parentBlock.synchronizer.croquetModel.spec);
		expect(blockA.spec).toBe(blockA.synchronizer.croquetModel.spec);
		expect(blockB.spec).toBe(blockB.synchronizer.croquetModel.spec);
	      } else {
		expect(parentBlock.synchronizer).toBe(parentBlock);
	      }
	    });
	  });
	});
	it('block model is equal to models of children.', function () {
	  run((parentBlock, blockA, blockB) => {
	    expect(parentBlock.model.childA).toEqual(blockA.model);
	    expect(parentBlock.model.childB).toEqual(blockB.model);
	  });
	});
      });
      describe('children', function () {
	it('models have a named property for each child.', function () {
	  blocks.forEach(block => expect(block.model.childA).toBeDefined());
	});
	it('blocks themselves do not have child properties.', function () {
	  blocks.forEach(block => expect(block.childA).toBeUndefined());
	  // FIXME: should a model child have a parent property? Note that spec will not match
	});
	// FIXME: effect on specs?
      });
      describe('API', function () {
	describe('property changes', function () {
	  it('has model property.', function () {
	    expect(getFirstParentBlock().model).toBeTruthy();
	  });
	  // FIXME: block properties
	  it('adds, changes, and removes properties.', async function () {
	    expect(getFirstParentBlock().model.someKey).toBeUndefined();

	    getFirstParentBlock().model.someKey = 3; // Create it.
	    await getFirstParentBlock().ready;
	    expect(getFirstParentBlock().model.someKey).toBe(3);
	    await tick();
	    blocks.forEach(block => expect(block.model.someKey).toBe(3));

	    getLastParentBlock().model.someKey = 99; // Change it, maybe from a different user.
	    await getLastParentBlock().ready;
	    await tick();
	    blocks.forEach(block => expect(block.model.someKey).toBe(99));

	    getLastParentBlock().model.someKey = undefined; // Remove it.
	    await getLastParentBlock().ready;
	    await tick();
	    blocks.forEach(block => expect(block.model.someKey).toBeUndefined());

	    // And in children:
	    getFirstChildBlock().model.someKey = 4; // Create it.
	    await getFirstChildBlock().ready;
	    expect(getFirstChildBlock().model.someKey).toBe(4);
	    await tick();
	    blocks.forEach(block => expect(getChildA(block).model.someKey).toBe(4));

	    getLastChildBlock().model.someKey = 5; // Change it.
	    await getLastChildBlock().ready;
	    expect(getLastChildBlock().model.someKey).toBe(5);	  
	    await tick();
	    blocks.forEach(block => expect(getChildA(block).model.someKey).toBe(5));

	    getFirstChildBlock().model.someKey = undefined; // Remove it.
	    await getFirstChildBlock().ready;
	    await tick();
	    blocks.forEach(block => expect(getChildA(block).model.someKey).toBeUndefined());
	  });
	  it('counts multiple rapid sends.', async function () {
	    let p = 0, c = 0;
	    function sendParent(n) {
	      for (let i = 0; i < n; i++) getFirstParentBlock().model.counter = ++p;
	    }
	    function sendChild(n) {
	      for (let i = 0; i < n; i++) getFirstChildBlock().model.counter = ++c;
	    }
	    sendParent(4);
	    sendChild(5);
	    sendParent(6);
	    await Promise.all([getFirstParentBlock().ready, getFirstChildBlock().ready]);
	    expect(getFirstParentBlock().model.counter).toBe(p);
	    expect(getFirstChildBlock().model.counter).toBe(c);
	    await tick();
	    blocks.forEach(block => expect(getFirstParentBlock().model.counter).toBe(p));
	    blocks.forEach(block => expect(getFirstChildBlock().model.counter).toBe(c));
	    // Now clean up from test.
	    getFirstParentBlock().model.counter = undefined;
	    getFirstChildBlock().model.counter = undefined;
	    await Promise.all([getFirstParentBlock().ready, getFirstChildBlock().ready]);
	    await tick();
	  });
	  it('sends all messages, even when we get throttled.', async function () {
	    let p = 0, c = 0;
	    function sendParent(n) {
	      for (let i = 0; i < n; i++) getFirstParentBlock().model.counter = ++p;
	    }
	    sendParent(100);
	    await getFirstParentBlock().ready;
	    expect(getFirstParentBlock().model.counter).toBe(p);
	    // cleanup
	    getFirstParentBlock().model.counter = undefined;
	    await getFirstParentBlock().ready;
	    await tick();
	  });
	});
	describe('dynamic children', function () {
	  let addedBlockToParent, addedBlockToChild;
	  beforeAll(async function () {
	    getFirstParentBlock().model.added = {type: 'Object', x: 1, y: "b"};
	    getFirstChildBlock().model.added = {type: 'Registered', x: 11, y: "bb"};
	    await Promise.all([getFirstParentBlock().ready, getFirstChildBlock().ready]);
	    await tick();
	    addedBlockToParent = getFirstParentBlock().getChild('added');
	    addedBlockToChild = getFirstParentBlock().getChild('childA').getChild('added');
	  });
	  afterAll(async function () {
	    getFirstParentBlock().model.added = undefined;
	    getFirstChildBlock().model.added = undefined;
	    await Promise.all([getFirstParentBlock().ready, getFirstChildBlock().ready]);
	    await tick();
	    expect(getFirstParentBlock().model.added).toBeUndefined(); // Check that objects get removed.
	    expect(getLastChildBlock().model.added).toBeUndefined();
	  });
	  it('added child is as connected connected as the parent.', function () {
	    const rootModel = getFirstParentBlock().synchronizer.croquetModel;
	    expect(!!addedBlockToParent.synchronizer.croquetModel).toBe(!!rootModel);
	    expect(!!addedBlockToChild.synchronizer.croquetModel).toBe(!!rootModel);
	  });
	  it('adds registered type as child.', async function () {
	    let parentAddedModel = getLastParentBlock().model.added,
		childAddedModel = getLastChildBlock().model.added;
	    expect(parentAddedModel.x).toBe(1);
	    expect(parentAddedModel.y).toBe("b");

	    expect(childAddedModel.x).toBe(11);
	    expect(childAddedModel.y).toBe("bb");
	  });
	  it('references through model child properties also detect modifications.', async function () {
	    getFirstParentBlock().model.childA.added.more = 99;
	    await addedBlockToChild.ready;
	    await tick();
	    expect(getLastParentBlock().model.childA.added.more).toBe(99);
	  });
	  it('generates path.', function () {
	    expect(getFirstParentBlock().path).toBe('/');
	    expect(addedBlockToChild.path).toBe('/childA/added/');
	  });
	  it('finds by path.', function () {
	    let root = getFirstParentBlock();
	    expect(root.find(root.path)).toBe(root);
	    expect(addedBlockToChild.find(root.path)).toBe(root);

	    expect(root.find(addedBlockToChild.path)).toBe(addedBlockToChild);
	    expect(addedBlockToChild.find(addedBlockToChild.path)).toBe(addedBlockToChild);
	  });
	});
	describe('offline toggle', function () {
	  function afterOnline() {
	    // Session is the same after coming back online, but the blocks list we grabbed earlier is not.
	    blocks = blocks.map(oldBlock => oldBlock.session.block);
	  }
	  async function goOffline() {
	    // I'd rather contort things to just take one offline...
	    //await blocks[0].leave();
	    // ...but my croquet-in-memory implementation isn't robust enough.
	    await Promise.all(blocks.map(block => block.leave()));
	  }
	  function clearRecordings() {
	    blocks.forEach(block => block.resetOfflineRecorder());
	  }
	  async function goOnline() {
	    // As above,
 	    //blocks[0] = await blocks[0].join(specOptions);
	    blocks = await Promise.all(blocks.map(block => block.join(specOptions)));
	  }
	  let dummy = 'while offline';
	  function checkOffline() {
	    expect(blocks[0].isOnline).toBeFalsy();
	  }
	  function checkOnline() {
	    expect(blocks[0].isOnline).toBeTruthy();
	  }
	  function whileOnline() {
	    // WTF does this fail: http://localhost:3000/?seed=34616
	    it('stop and starts.', async function () {
	      checkOnline();

	      await simulateVisibility('hidden');
	      checkOffline();
	      await simulateVisibility('visible');
	      afterOnline();
	      checkOnline();

	      // Finds by id IFF blocks we're online.
	      let root = getFirstParentBlock(),
		  child = root.getChild('childA');
	      //console.log(label, root.id, root === root.find(root.id));
	      //console.log(label, child.id, child === root.find(child.id), child, root.find(child.id));
	      expect(root.find(root.id)).toBe(root);
	      expect(child.find(root.id)).toBe(root);
	      expect(root.find(child.id)).toBe(child);
	      expect(child.find(child.id)).toBe(child);

	      await goOffline();
	      checkOffline();
	      getFirstChildBlock().model.someKey = dummy;
	      await getFirstChildBlock().ready;
	      expect(getFirstChildBlock().model.someKey).toBe(dummy);
	      // FIXME: create a new child and set a value there.
	      // FIXME: delete a child that existed when we were online and set a value there.

	      await goOnline();
	      checkOnline();
	      await tick(200);
	      blocks.forEach(root => expect(getChildA(root).model.someKey).toBe(dummy));
	      getFirstChildBlock().model.someKey = undefined;
	      await getFirstChildBlock().ready;
	      await tick();
	    }, 15000);
	  }
	  if (online) {
	    beforeAll(function () {
	      clearRecordings(); // fixme: we shouldn't need this. I'd like to not record until we're attached and detached.
	    });
	    whileOnline();
	  } else {
	    beforeAll(async function () {
	      await goOnline();
	    });
	    afterAll(async function () {
	      await goOffline();
	    });
	    whileOnline();
	  }
	});
	// FIXME: add, change, and remove child. (add to first block, change on last.)
	//        Internal: make sure childBlock.spec === parentBlock[childName].spec. (The general internal machinery test doesn't check this because init is different.)
	//        try setting a child when there is already one of that of that name with different values.

	// FIXME: join from an existing block should grab recording, destroy block tree, and play back recording (at speed) after joining
	// FIXME: should not record until we're integrated into a session
	// FIXME: pause/leave should not destroy blocks, letting you continue to work as you were.

	// FIXME: display - and confirm that it would be able to add/remove to the right place during object add/remove AND offline/online
	// FIXME: actions
	// FIXME: decide on spec api, and test it
      });
      describe('behavior', function () {
	// FIXME: change a property on a child that will have been removed by the time the message is reflected.
	// FIXME: same for removing a child already removed
	// FIXME: effect of removal on display
	// FIXME: registration: a class, Object
	// FIXME: reload of a scene at an earlier timestamp
	describe('model registration', function () {
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
	  // FIXME: set model property to these and have it implicitly create them. Be sure to remove
	})
	// FIXME: toggle whether first block is online or not. (show that changes before toggle  and during toggle are retained, e.g., even when offline)
	// FIXME: pause/resume
      });
    }
    function setOptions(label) {
      specOptions = Object.assign({}, {options: testSpec}, basicOptions)
      specOptions.name += label; // Different sessions for different labels.
    }
    describe('offline', function () {
      beforeAll(function () {
	setOptions('offline');
	blocks = [new Block(testSpec)];
      });
      runTests('offline', false);
    });
    describe('online', function () {
      beforeAll(async function () {
	setOptions('online');
	blocks = [await Block.join(specOptions)];
      });
      runTests('online');
    });
    describe('with multiple participants', function () {
      beforeAll(async function () { // Get a list of blocks joined to the same spec.
	setOptions('multi');
	blocks = await Promise.all([specOptions, specOptions].map(spec => Block.join(spec)));
      });
      runTests('multi');
    });
    // FIXME: A model that is online in one session, with a view that is online in the same session.
    // FIXME: A model that is online in one session, with a view that is online in a different session.

    // FIXME maybe: Show that all this works for rulified models, too. Show some illustration of WHY we do rules and confirm that it indeed works.
  });
});
