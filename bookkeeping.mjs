import { Assembly } from "./assembly.mjs";

// The BookkeepingAssembly expects the entity to have various methods and properties to do bookkeeping:
//   find(croquetModelIdentifier) => entity
//   create(name, spec) => entity
//     Called on the parent entity, but the method probably doesn't need to arrange parent/child bookkeeping,
//     because the caller will call changeParent => addChild
//   destroy()
//     Expected to call assembly.destroy() to cleanup bookkeeping
//   template => an object that stores values under names using: template[key] = value, and delete template[key]
//   updateTemplate(key, value)
//     Take the entity-specific action equivalent to template[key] = value.
//     FIXME: spec updateTemplate better.
// FIXME: unit tests
export const BookkeepingAssembly = superclass => class extends Assembly(superclass) {
  // This is the main entry point: Update our template, creating and destroying children as needed.
  setTemplateProperty(key, value) { 
    if (key === 'parent') { // special case for moving an entity from one parent to another, without destroying it.
      this.changeParent(this.find(value));
      return;
    }
    this.getChild(key)?.destroy(); // If there is already a child object at key, clean it up before overrwriting it.
    if (value && value.type) {
      this.create(key, value).changeParent(this, key); // child.changeParent does this.updateTemplate(key, child.template)
    } else {
      this.updateTemplate(key, value);
    }
  }
  destroy() { // Clean up us and our children from parents
    this.forEachChild(child => child.destroy());
    this.changeParent(null); // changeParent notifies the model/template.
  }
  // FIXME: deal with name conflicts in children or spec
  changeParent(parent, name = this.name) { // Remove any old parent, and add any new one.
    this.parent?.removeChild(this);
    parent?.addChild(name, this);
  }
  // FIXME: decide on order of arguments and be consistent throughout
  addChild(name, child) { // Bookkeeping of assembly and template
    this.updateTemplate(name, child.template);
    super.addChild(name, child);
  }
  removeChild(child) { // Bookkeeping of assembly and template
    this.updateTemplate(child.name, undefined);
    super.removeChild(child);
  }
}
