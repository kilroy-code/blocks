# Assembly

Implements a parent / named-child relationship.

## API

There are two implementations, defining the same properties.  One using simple getters and setters:

```
import { SimpleAssembly } from '@kilroy-code/block/assembly.mjs';
class MyClass extends SimpleAssembly(Object) { // Or replace Object with any other base class.
  ...
}
```
And the other using [Rules](../Rules/README.md):

```
import { RuledAssembly } from '@kilroy-code/block/ruledAssembly.mjs';
class MyClass extends RuledAssembly { // RuledAssembly is not a mixin. It is a subclass of Object.
  ...
}
```

**`parent`** - Setting this property to an Assembly of the same kind causes the object to be a child of the parent. Setting it to `null` removes the object from the previous parent, if any. (The behavior is not defined for other values.)

**`name`** - The value is the name under which the object is known within the parent. Setting this value causes the object to be known by the new name in the parent, if any, and no longer by the old name.

Currently, the names must be unique amongst those of the same `parent` (else an error is thrown when setting `name` or `parent` in a way that causes a conflict). However, the children are not currently in the same namespace as the object's properties. For example, you could currently have a child with `name` `'parent'`, `'name'`, `'children'`, or `'getChild'`.

**`getChild(`_name_`)** - Answers the object with the given `name` that has had `parent` set to this object.

**`children`** - A read-only iterable snapshot of the current children of the object. Do not set this property, or any elements of the list, and do not cache it.

