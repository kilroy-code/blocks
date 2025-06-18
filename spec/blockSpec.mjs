import { Block } from '../block.mjs';
import { RuledAssembly, Ruled } from '../ruledAssembly.mjs';

describe('Block', function () {
  let counter = 0;
  class MockMessenger {
    static blocks = new WeakMap();
    constructor({specs = [], ...replicatedSpec}, block) {
      // A CroquetBlock is created by a Croquet.View as messenger, which itself is
      // given a Croquet.Model as a kind of proxy for the replicatedSpec.
      // Here we are not testing that machinery, but rather how the Block interacts with
      // it's messenger to the replicatedSpec.
      this.spec = replicatedSpec; // spec object should not contain 'specs'
      this.specs = specs
      this.block = block;
      this.sessionCachedBlocks = MockMessenger.blocks;
    }
    setModelProperty(key, value) {
      counter++;
      this.spec[key] = value;
      this.block.setUnderlyingValue(key, value);
    }
    integrateChildren() {
      for (let spec of (this.specs || [])) { // FIXME: We need specs to be copied at some point. Don't want tests to accidentally pass!
	let child = new TestBlock(spec);
	child.setParent(this.block);
      }
    }
  }
  class MockBlockBase {
    constructor(replicatedSpec) { // As noted above, this is the other way around from a CroquetBlock.
      this.messenger = new MockMessenger(replicatedSpec, this); // Must be available for Block()'s constructor.
    }
  }
  class TestBlock extends Block(MockBlockBase) {
  }
  class SomeModel extends RuledAssembly(Object) {
    get foo() { return 'foo'; }
    get bar() { return this.foo + 'bar'; l}
    get node() { return this.parent; }
    get nodes() { return [this, this.parent]; }
    get strangeObject() { return {foo: this, bar: this.parent}; }
  }
  TestBlock.register(SomeModel);
  describe('class register / create', function () {
    it('allows creation.', function () {
      let template = TestBlock.createTemplate({type: 'SomeModel'});
      expect(template).toBeInstanceOf(SomeModel);
      expect(template.bar).toBe('foobar');
      template.foo = 'foo2';
      expect(template.bar).toBe('foo2bar');
    });
    it('populates properties.', function () {
      let template = TestBlock.createTemplate({type: 'SomeModel', foo: 'foo1', baz: 17});
      expect(template.bar).toBe('foo1bar');
      expect(template.baz).toBe(17);
    });
    it('defaults to Ruled type.', function () {
      let template = TestBlock.createTemplate({foo: 'foo1'});
      expect(template).toBeInstanceOf(Ruled);      
      expect(template.foo).toBe('foo1');
      template.foo = 'foo2';
      expect(template.foo).toBe('foo2');
    });
  });
  describe('unreplicated underlying data', function () {
    describe('records in block instance for internal use', function () {
      it('which can be retrieved with getTemplateBlock.', function () {
	let block = new TestBlock({}),
	    template = block.createTemplate({type: 'SomeModel'});
	expect(block.getTemplateBlock(template)).toBe(block);
      });
      it('across block.', function () {
	let block = new TestBlock({name: 'parent', specs: [{name: 'child1'}, {name: 'child2'}]}),
	    template = block._template, // Hence internal use.
	    associatedBlock = block.getTemplateBlock(template),
	    template2 = block._template.getChild('child1'),
	    associated2 = block.getTemplateBlock(template2);
	expect(associatedBlock).toBe(block);
	expect(associated2._template).toBe(template2);
      });
    });
    describe('setUnderlyingValue', function () {
      it('sets in template.', function () {
	let block = new TestBlock({});
	block.setUnderlyingValue('foo', 17);
	expect(block._template.foo).toBe(17);
      });
    });
    describe('unreplicated parent/child', function () {
      it('setParent adds to blockChildren.', function () {
	let block = new TestBlock({}),
	    block2 = new TestBlock({});
	block.setParent(block2);
	let block2children = block2.blockChildren;
	expect(block2.blockChildren).toEqual([block]);
	expect(block2._template.children).toEqual([block._template]);
      });
      it('setParent(null) removes child.', function () {
	let block = new TestBlock({}),
	    block2 = new TestBlock({});
	block.setParent(block2);
	expect(block2.blockChildren.length).toBe(1);
	block.setParent(null);
	expect(block2.blockChildren.length).toBe(0);
	expect(block._template.parent).toBe(null);
      });
    });
  });
  describe('replicated template', function () {
    let block = new TestBlock({name: 'marker', specs: [{name: 'child', type: 'SomeModel'}]}),
	child = block.blockChildren[0];
    describe('setters', function () {
      it('of ordinary property value by sending through messenger.', function () {
	block.template.foo = 17;
	expect(block.messenger.spec.foo).toBe(17);
      });
      describe('keeps track of messages in flight', function () {
	it('for same property in object.', async function () {
	  await block.ready;
	  let start = counter;
	  for (let i = 1; i <= 10; i++) block.template.counted = i;
	  await block.ready;
	  expect(counter - start).toBe(10);
	  expect(block.messenger.spec.counted).toBe(10);
	  expect(block.template.counted).toBe(10);	  
	});
	it('for any property in object.', async function () {
	  await block.ready;
	  let start = counter;
	  for (let i = 1; i <= 10; i++) {
	    block.template.counted = i;
	    block.template.counted2 = i;
	  }
	  await block.ready;
	  expect(counter - start).toBe(20);
	  expect(block.messenger.spec.counted2).toBe(10);
	  expect(block.template.counted2).toBe(10);
	});
      });
    });
    describe('answers', function () {
      describe('known nodes as a similarly replicated proxy, including', function () {
	it('parent.', function () {
	  expect(block.template.parent).toBe(null);
	  expect(child.template.parent).toBe(block.template);
	  child.template.parent.setThroughParent = 'yes';
	  expect(block.messenger.spec.setThroughParent).toBe('yes');
	  expect(block.template.setThroughParent).toBe('yes');	  
	});
	it('application-defined rule.', function () {
	  expect(child.template.node).toBe(block.template);
	  child.template.node.setThroughNode = 'yes';
	  expect(block.messenger.spec.setThroughNode).toBe('yes');
	  expect(block.template.setThroughNode).toBe('yes');	  
	});
	it('children.', function () {
	  expect(block.template.children).toEqual([child.template]);
	  block.template.children[0].setThroughChildren = 'yes';
	  expect(child.messenger.spec.setThroughChildren).toBe('yes');
	  expect(child.template.setThroughChildren).toBe('yes');
	});
	it('getChild.', function () {
	  expect(block.template.getChild('child')).toEqual(child.template);
	  block.template.getChild('child').setThroughGetChild = 'yes';
	  expect(child.messenger.spec.setThroughGetChild).toBe('yes');
	  expect(child.template.setThroughGetChild).toBe('yes');
	});
      });
      it('the associated block, even though the underlying template cannot.', function () {
	expect(block.template.block).toBe(block);
	expect(block._template.block).toBeUndefined();
      });
    });
  });
});
