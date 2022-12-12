import { Rule } from '@kilroy-code/rules/index.mjs';
import { Assembly, SimpleAssembly} from '../assembly.mjs';
import { RuledAssembly } from '../ruledAssembly.mjs';
const Ruled = RuledAssembly(Object);

function testAssembly(Assembly, rulify = _=>_) {
  describe('initially', function () {
    it('has name.', function () {
      expect(new Assembly().initialize({name: 'a'}).name).toBe('a');
    });
    it('has null parent.', function () {
      expect(new Assembly().initialize({name: 'a'}).parent).toBe(null);
    });
    it('has no children.', function () {
      expect(new Assembly().initialize({name: 'a'}).children).toEqual([]);
    });
  });
  describe('assigned parent', function () {
    let parent = new Assembly().initialize({name: 'parent'}),
	child = new Assembly().initialize({name: 'child', parent});
    it('has named child.', function () {
      expect(parent.getChild('child')).toBe(child);
    });
    it('is parent of child.', function () {
      expect(child.parent).toBe(parent);
    });
  });
  describe('assigned same parent again', function () {
    let parent = new Assembly().initialize({name: 'parent'}),
	child = new Assembly().initialize({name: 'child', parent});
    child.parent = parent; // Can safely set to same value.
    it('has named child.', function () {
      expect(parent.getChild('child')).toBe(child);
    });
    it('is parent of child.', function () {
      expect(child.parent).toBe(parent);
    });
  });
  describe('cleared parent', function () {
    let parent = new Assembly().initialize({name: 'parent'}),
	child = new Assembly().initialize({name: 'child', parent});
    child.parent = null;
    it('has no child of that name.', function () {
      expect(parent.getChild('child')).toBeUndefined();
    });
    it('is not parent of child.', function () {
      expect(child.parent).toBe(null);
    });
  });
  describe('reassigned', function () {
    let child = new Assembly().initialize({name: 'child'}),
	a = new Assembly().initialize({name: 'a'}),
	b = new Assembly().initialize({name: 'b'});
    child.parent = a;
    child.parent = b; // same as first setting child.parent = null;
    it('old parent has no child of that name.', function () {
      expect(a.getChild('child')).toBeUndefined();
    });
    it('new parent has named child.', function () {
      expect(b.getChild('child')).toBe(child);
    });
    it('child has new parent.', function () {
      expect(child.parent).toBe(b);
    });
  });
  describe('assigning two children with same name', function () {
    let parent = new Ruled().initialize({name: 'parent'}),
	otherParent = new Ruled().initialize({name: 'other'}),
	successful = new Ruled().initialize({name: 'child', parent}),
	duplicate = new Ruled().initialize({name: 'child', parent: otherParent}),
	thrown = null;
    try {
      duplicate.parent = parent;
    } catch (error) {
      thrown = error;
    }
    it('throws an error.', function () {
      expect(thrown).toBeInstanceOf(Error);
    });
    it('original child retains parent.', function () {
      expect(successful.parent).toBe(parent);
    });
    it('parent retains original child.', function () {
      expect(parent.getChild('child')).toBe(successful);
    });
    it('duplicate parent does not change.', function () {
      expect(duplicate.parent).toBe(otherParent);
    });
    it('parent of duplicate retains child of duplicate name.', function () {
      expect(otherParent.getChild('child')).toBe(duplicate);
    });
  });
  describe('assigning an existing name', function () {
    let parent = new Ruled().initialize({name: 'parent'}),
	successful = new Ruled().initialize({name: 'child', parent}),
	duplicate = new Ruled().initialize({name: 'child'}),
	thrown = null;
    try {
      duplicate.parent = parent;
    } catch (error) {
      thrown = error;
    }
    it('throws an error.', function () {
      expect(thrown).toBeInstanceOf(Error);
    });
    it('original child retains parent.', function () {
      expect(successful.parent).toBe(parent);
    });
    it('parent retains original child.', function () {
      expect(parent.getChild('child')).toBe(successful);
    });
    it('duplicate parent does not change.', function () {
      expect(duplicate.parent).toBe(null);
    });
  });
  describe('children', function () {
    let parent = new Assembly().initialize({name: 'parent'}),
	a = new Assembly().initialize({name: 'a', parent}),
	b = new Assembly().initialize({name: 'b', parent}),
	c = new Assembly().initialize({name: 'c', parent});
    b.parent = null;
    it('has values in order.', function () {
      expect(parent.children).toEqual([a, c]);
    });
    it('finds by name', function () {
      expect(parent.getChild('a')).toBe(a);
      expect(parent.getChild('b')).toBeFalsy();
      expect(parent.getChild('c')).toBe(c);      
    });
  });
  describe('change of name', function () {
    let parent = new Assembly().initialize({name: 'parent'}),
	child = new Assembly().initialize({name: 'child', parent});
    child.name = 'fred';
    it('causes parent to know child of new name.', function () {
      expect(parent.getChild('fred')).toBe(child);
    });
    it('causes parent to no longer have old name as child.', function () {
      expect(parent.getChild('child')).toBeFalsy();
    });
  })  
  describe('constructor sets properties.', function () {
    let parent = new Assembly().initialize({name: 'parent'}),
	instance = new Assembly().initialize({name: 'x', parent, foo: 17});
    it('including name.', function () {
      expect(instance.name).toBe('x');
    });
    it('including parent.', function () {
      expect(instance.parent).toBe(parent);
    });
    it('including random others.', function () {
      expect(instance.foo).toBe(17);
    });
  });
  describe('with parent before name in properties', function () {
    let parent = new Assembly().initialize({name: 'parent'}),
	child = new Assembly().initialize({parent, name: 'child'});
    it('child has parent.', function () {
      expect(child.parent).toBe(parent);
    });
    it('parent has child of that name.', function () {
      expect(parent.getChild('child')).toBe(child);
    });
  });
  it('rule dependent on parent will track changes to parent.', function () {
    class TracksParentName extends Assembly {
      get parentName() {
	return this.parent.name;
      }
    }
    rulify(TracksParentName.prototype);
    let p1 = new Assembly().initialize({name: 'p1'}),
	p2 = new Assembly().initialize({name: 'p2'}),
	child = new TracksParentName().initialize({name: 'child', parent: p1});
    expect(child.parentName).toBe('p1');
    child.parent = p2;
    expect(child.parentName).toBe('p2');
  });
  it('rules dependent on name will track changes to name.', function () {
    class TracksName extends Assembly {
      get namePlus() {
	return this.name + '_foo';
      }
      get selfThroughParent() {
	return this.parent.getChild(this.name); // should return us if the name is right.
      }
      get parentName() {
	return this.parent.name;
      }
    }
    rulify(TracksName.prototype);
    let parent = new Assembly().initialize({name: 'parent'}),
	child = new TracksName().initialize({name: 'child', parent});
    expect(child.namePlus).toBe('child_foo');
    expect(child.selfThroughParent).toBe(child);
    expect(child.parent).toBe(parent);    
    child.name = 'fred';
    expect(child.namePlus).toBe('fred_foo');
    expect(child.selfThroughParent).toBe(child);
    expect(child.parent).toBe(parent);
  });
  it('rule dependent on children will track changes to children.', function () {
    class TracksChildren extends Assembly {
      get childrenFoo() {
	return this.children.reduce((total, child) => total + child.foo, 0);
      }
    }
    rulify(TracksChildren.prototype);
    let parent = new TracksChildren().initialize({name: 'parent'}),
	a = new Assembly().initialize({name: 'a', parent, foo: 1}),
	b = new Assembly().initialize({name: 'b', parent, foo: 2}),
	c = new Assembly().initialize({name: 'c', parent, foo: 3});
    expect(parent.childrenFoo).toBe(6);
    a.parent = null;
    expect(parent.childrenFoo).toBe(5);
  });
}
describe('Assembly', function () {
  describe('simplified', function () {
    testAssembly(SimpleAssembly(Object));
  });
  describe('rulified', function () {
    testAssembly(Ruled, Rule.rulify);
    describe('defaulting', function () {
      let grandparent = new Ruled().initialize({name: 'grandparent', uniqueInGrandparent: 'grandparent', shared: 'grapndparent'}),
	  parent = new Ruled().initialize({name: 'parent', parent: grandparent, uniqueInParent: 'parent', shared: 'parent', explicit: 'parent'}),
	  child = new Ruled().initialize({name: 'child', parent, uniqueInChild: 'child', explicit: undefined});
      it('finds in node.', function () {
	expect(child.defaulted('uniqueInChild')).toBe('child');
      });
      it('finds in parent.', function () {
	expect(child.defaulted('uniqueInParent')).toBe('parent');
      });
      it('finds in grandparent.', function () {
	expect(child.defaulted('uniqueInGrandparent')).toBe('grandparent');
      });
      it('stops when found.', function () {
	expect(child.defaulted('shared')).toBe('parent');
      });
      it('answers specified default if not found.', function () {
	expect(child.defaulted('nowhere', 33)).toBe(33);
      });
      it('answers undefined if not found and no default specified.', function () {
	expect(child.defaulted('nowhere')).toBeUndefined();
      });
      it('explicitly answering undefined stops search.', function () {
	expect(child.defaulted('explicit', 17)).toBeUndefined();
      });
    });
  });
});
