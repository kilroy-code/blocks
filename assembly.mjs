export const Assembly = superclass => class extends superclass {
  get children() {
    return Object.values(this._childMap);
  }
  getChild(name) {
    return this._childMap[name];
  }
  _ensureUniqueName(name) {
    if (this.getChild(name)) throw new Error(`${parent} already has child named ${this.name}.`);
  }
  _setParent(parent) {
    if (parent !== this.parent) parent?._ensureUniqueName(this.name);
    this.parent?._removeChild(this);
    parent?._addChild(this);
    return parent;
  }
  _setName(name) {
    let parent = this.parent;
    if (name !== this.name) parent?._ensureUniqueName(name);
    parent?._removeChild(this);
    this._setRawName(name);
    parent?._addChild(this);
    return name;
  }
  // We don't call initialize in our constructor for two reasons:
  // 1. Some superclasses might require specific arguments that are different from properties.
  // 2. The superclass constructor must run to completion before any subclass method (such as initialize) can access properties.
  initialize({parent, ...properties}) { // Parent must be assigned last (e.g., after name).
    Object.assign(this,
		  properties,
		  parent === undefined ? {} : {parent});
    return this; // So that it can be chained.
  }
};

export const SimpleAssembly = superclass => class extends Assembly(superclass) {
  _name;
  _parent = null;
  _childMap = {};

  get name() {
    return this._name;
  }
  set name(name) {
    this._setName(name);
    return true;
  }
  _setRawName(name) {
    this._name = name;
  }

  get parent() {
    return this._parent;
  }
  set parent(parent) {
    this._setParent(parent);
    return true;
  }
  _setParent(parent) {
    super._setParent(parent);
    this._parent = parent;
  }

  _addChild(child) {
    this._childMap[child.name] = child;
  }
  _removeChild(child) {
    delete this._childMap[child.name];
  }
}
