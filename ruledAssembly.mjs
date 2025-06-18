import { Rule } from '@kilroy-code/rules/index.mjs';
import { Assembly } from './assembly.mjs';

export const RuledAssembly = superclass => {
  let kind = class extends Assembly(superclass) {
    _setRawName(name) { // While not documented, this is the supportable way to reach in to a rule to changed the cached value.
      Rule.getRule(this, 'name').storeValue(this, 'name', name);
    }
    
    // As for SimpleAssembly, applications must not assign children, nor directly assign properties of children.
    // This is not enforced. We might consider enforcing this (with a getter to a proxy).
    _addChild(child) {
      this._childMap[child.name] = child;
      this._childMap = this._childMap; // Reset dependents.
    }
    _removeChild(child) {
      delete this._childMap[child.name];
      this._childMap = this._childMap; // Reset dependents.
    }
    defaulted(name, ultimateDefault = undefined) {
      if (name in this) return this[name];
      const {parent} = this;
      if (!parent) return ultimateDefault;
      return parent.defaulted(name, ultimateDefault);
    }
  };
  Rule.attach(kind.prototype, '_childMap', _ => ({})); // Parens are because {} in a fat arrow function are interpeted as function body.
  // These two are ordinary rules with a boring default, but an interesting side-effect.
  Rule.attach(kind.prototype, 'name', null, {assignment: (value, key, self) => self._setName(value)});
  Rule.attach(kind.prototype, 'parent', null, {assignment: (value, key, self) => self._setParent(value)});
  return kind;
};

export class Ruled extends RuledAssembly(Object) {};

