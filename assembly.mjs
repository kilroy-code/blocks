// Mixin providing basic parent/child management.
// Consider name, parent, and children to be read-only.
//
// This is implemented as a "mixin" class expresssion so that it can be used in multiple places with different superclasses,
// such as Object and Croquet.Model.
// Usage is:                class MySubclass extends Assembly(MySuperclass) { ... }
//
// Alternatively, we could have implemented this as a class to be instantiated as an ivar within other classes, and
// used Croquet.Model.types to define how Assembly is serialized. I.e., your class has-a Assembly, instead of is-a.
// Indeed, that's what was done first. But using "mixins" turned out to be little bit tighter.

export const Assembly = superclass => class extends superclass {
  // Children are tracked by name in a separate namespace.
  constructor(...args) {
    super(...args);
    this.children = {};              // Bookkeeping for creating.
    this.name = this.parent = null;  // Bookkeeeping for destroying.
  }
  getChild(name) { // Return the child with the given name, else nullish.
    return this.children[name];
  }
  forEachChild(iterator) { // Call iterator(child, name) on each child.
    const {children} = this;
    for (let name in children) {
      iterator(children[name], name);
    }
  }
  addChild(name, childEntity) { // Make note of child as name, for use above.
    if (this.children[name]) throw new Error(`Changing existing ${name} to ${childEntity} is not supported. Change ${name} to undefined first.`);
    this.children[name] = childEntity;
    childEntity.name = name;
    // Subtle: A block can have a parent because a block has lots of non-identity properties. That's the point of a block.
    // However, a model can only have identity properties, and the same model (by hash) can be used in many places, with different parents in each.
    // So no parent property in a model!
    childEntity.parent = this;
  }
  removeChild(childEntity) { // Make child no longer track as name, above.
    delete this.children[childEntity.name];
    childEntity.name = childEntity.parent = null;
  }
}
