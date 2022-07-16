# Blocks

Uses Croquet to keep models in sync among all users.

1. Assign properties, and values automatically show up live in all replicas.
2. Late-joiners get the same state.
3. Unhiding browser tab rejoins and gets same state.
4. Can start with a model to use, e.g., from separate storage.

## From an application perspective:

Every application object is a Block, which has one named 'model' component and any number of view components. The model is synchronized among all the concurrent users: any assignment to a property in the model will make the same change in the model for all users. The model's properties can be read by any code.

Assignment of block model properties is not immediate. I.e., you make the assignment to the model property and it goes through the Croquet reflector before the value actually changes in the block model. There is a property on the block called 'ready' that answers a promise that fullfils as soon as there are no outstanding assignments on the block. For example, you might update a number of block properties all at once - or maybe some of them several times in a stream of changes. When you are done, you can call 'ready()' and await its resolution before reading examing the new state.

The Block also has a property named 'spec', which is a POJO that always contains all and only the assigned rules of the model. (It does not contain any rule value that was computed by the rule's default formula, or which has not been demanded.)  The spec is not writeable.

## Implementation, from a Croquet perspective:

### some notes....

Definitions:
"role": A group of objects that provide a particular mechanism of the whole. These might inherit from a base class, but they might also be POJOs.
"type": when different objects in the same role have different behavior, they are differentiated by a different type.
   A type name is just a string that denotes the type.
   The type itself is a class that was registered so that the system can map a type name to a type.
"isolated": when objects of one role do not reference those of another given role.
"generic": when objects of a role do not even need to distinguish between different kind of objects within the same role. They can then be implemented with a single base class (or POJO).

Isolation is not broken by a type name that passes through the behavior of an isolated role as opaque data.

Roles:
ki1r0y specs must be POJOs because they are serializable as JSON to files and within Crqouet. => Generic
  Can be (de-)serialized (JSON), but has no other behavior.
  However, it does specify type names that are expanded in blocks and models to produce behavior there.
Croquet.Models are isolated from all other roles other than ki1r0y specs. => Generic
ki1r0y models are isolated from all other roles other than ki1r0y specs. Not generic, because they can have type-specific rule formulae.
Synchronizer (Croquet.View) DOES know about blocks:
  - Re-integrate when waking up.
  - Replace the block.model with a Proxy when integrating, and undo that when detaching.


Media Component Example - Image:
  The object is a block like any other. The model is of some type and has rules.
  The default DOM content view for this type is as an <IMG>. (In this example, it doesn't matter how that is looked up. Might be based on mime type.)
  The block has a view component that creates an IMG DOM element, giving it a src attribute based on info in the model (e.g., a mediatag property).
  The IMG DOM element is added to a parent element based on information in the model (such as a parent rule).
  Attaching and detaching the view component on the block, should also attach/detach the IMG element in the DOM.
  A change to model properties (e.g., the mediatag property) should update the IMG element.
    In general, property setting should be side-effects of rules that are dependent on properties of the model.
    The overall 'update' rule should reference these (so that it resets if any change).
      The update rule should be referenced by the constructor, right after the display object is created.
      The update rule should be "eager", so that after it is demanded once, it will be re-demanded immediately when reset.
  This means that the view component must know:
    The view component parent (so that it can add the IMG element). This might have no relation to any parent property of the model.
    The IMG element that it creates (so that it can remove it).
    In this example, it doesn't matter whether these are direct references to objects, or an idtag that can be used to look up the objects.
  Synchronization with other users is through the model, not this display component. The component only needs to know how to track the model.
    So, if the application is changing, e.g., the mediatag property of the model, the IMG will change.
  The application can treat the component as a black box. It only needs to know how to look up the component implementation and add it to the block.
  Neither the block model nor the component needs access to the actual media. The component merely passes strings around.

Media Component Example - Code:
  Very similar to the Image example, but for a script element.
  A display component rule can assign the src attribute of an existing HTMLImageElement, and it will reload.
    However, this isn't true for HTMLScriptElement, and so the script element will need to be replaced when there are changes.
  If component makes a script element with no type attribute, toplevel definition in the script will be referenceable as globals.
  However, if the script element is of type "module", it can only side effect the window global or other modules that the script imports.
    So for example, if it is providing type definitions, the script should import the machinery to register them and, in fact, register them.
  Usually, a spec for a model or view component will specify a type name, that goes through some machinery to resolve into a class:
    If not already known, a script model is created by the application machinery and the media retrieved, which side-effects the registry lookup.
    If the model is a thing (a fixed version), then that source hash is retrieved.
    If the model is a place, the latest version at the time of lookup would be retrieved. (See below.) This would be somewhat dangerous because:
      It may have worked before, but now there is a bug in the newer version.
      The results would be undefined if there is a later reference to the same place after the first was cached during the same session.
    If the application has joined the place (which we will do by default), the application will see the new version as it happens.
      If the machinery tracks dependencies (which it should), then the new version will be loaded, AND anything dependent on the registration
      machinery will be reset.

kill me notes:
referenced
eager
eager
checking count 2
reset
eager      <= we don't want this
checking count 3 <= we want 2 still
//eager <= we do want this now, not cached
checking count 3

Gesture Example - positioning content with a specific handler (e.g, not event delegation)
  DOM display object has a pointerdown handler.
  Dynamically attaches pointermove, touchmove, and pointerup DOM handlers to the associated display object.
  Stores transient state info within the handler object (e.g, initial event.clientX, target computed style left).
  During the gesture  (e.g., in the temporary DOM handlers that it added for pointer/touchmove),
    it assigns to the associated block.model (a Proxy) and refers to block.ready (on the Synchronizer).
  The model rules should react to these assignments (e.g. changing the position of the DOM element).
    (We rely on rule caching, and rule tracking through dynamic extent.)
  This means the handler has reference to:
    The DOM element of the view that that behavior is attached to.
    The block that the view is part of.

Gesture Example - positioning content with an event delegation handler:
  Generally like the above.
  The DOM element on which to add/remove handlers is the event target, not the one in the view that the behavior is attached to.
  The block to be operated on (block.model and block.ready) is the block associated with the event.target DOM element, not the one to which the behavior is attached. This means that we need a way to map from DOM element to the block with which it is associated.
  It is PROBABLY ok store temporary gesture information in the handler object, as long as it isn't a long-lived thing in which one user can have overlapping gestures, or multiple users can participate in the same gesture. Hmmmm. Maybe create storage indexed by event.pointerId?

Gesture Example - different views that are simultaneously displayed for the same block (i.e, the same model) might have different have different handlers for their individual DOM elements. E.g. a main content display might handle arrow keys by moving the object around, while a property editor view might move to the next or previous property. [[hmmm, is this really what we're talking about here?
  Maybe the property editor a separate block that has a model input, while the content display is really in the block with the model.
  Or maybe these are both dynamically created displays on the same block, created through an inheritance mechanism?]]

Gesture Example - Interactively building a visual model with behaviors, that is also in use in the same composition:
  Model has parent, child1, and child2. The block for this is joined to a party with other users.
  The application provides a default "display" view of type "GenericNode", that is being used by some user for parent and child1.
  That user has a block for child2 that specifies a different "display" view named "Foo".
  "Foo" could be static code provided by the application, or loaded dynamically.
    In the usual case, the name "Foo" is probably a particular fixed version for which we dynamically load the media (text/javascript) as a script.
    However it could be (originally or through user action), a place for which the link means "newest", which requires joining the party for that place.
  Here the user has joined the session for "Foo" (simultaneously to the session for parent).

speculative desired event handling:
- A component of a block has a direct reference to the block that it is within.
- Everyone's model must be the same, and so 1 model/block, and 1 session/block.
- Users may have different views of the same model, and so the block as a whole is not replicated across all users.
- Dom events behave as they normally do over the dom objects (capture, bubbling, etc.)
- A visual block has named components for the various handlers. The system takes care of adding/removing listeners to the corresponding dom objects.
- A block has some default behavior (from inheritance, but overridable in instances):
   A generic visual representation, either box-like or text, but likely both.
   The visual representation can be selected.
   The visual representation be dragged and dropped.
   The visual representation can be positioned (staying attached to the same parent)
- Inheritance - looking up a handler occurs in order:
  Through the visual tree, which might be different than the model:
     Complex visuals might be created with DOM elements that are defined in code outside of Ki1r0y, and thus might not have a model representation.
     Some user interfaces might organize the visuals in a parent-child relationship for layout that is different than the logical one in the model.
     Thus this first lookup must use the host event-handler lookup mechanism (e.g., DOM handlers).
     At some point in the visual tree - e.g., the "content area" or the "application chrome", but it could be anwhere - the host lookup can be stopped, 
       with the event then explicitly re-dispatched to any of the following.
  Through the block tree? What does this mean?
  The user's own object may define default or backstop behaviors.
  The application may define default or backstop behaviors.
- The handler ultimately causes some change. Usually, this will be a change to the model, causing rules to reset.
  If the reference is directly to a naked model (e.g., if the handler is manipulating a deserialized thing), no one else sees the change.
  If the reference is through a block's proxy, then it will be intercepted and sychronized across the party. This occurs to the first "place" within the parent hierarchy.


Croquet keeps its model objects in sync: a change to any user's replica is reflected in all replicas, and late-joiners quickly get a matching replica.

Croquet has a very flexible mechanism by which an application can define how each model object causes zero or more corresponding view objects to be created, perhaps differently for different users. It is fairly easy to build a generic framework on top of this mechanism in which changes to a view automatically drive changes to the model, which then reflects back to each view. This is, roughly, our goal.  For example, we can arrange for each view object to have a proxy to a corresponding model object, such that when a view assigns a model object property, the framework automatically asks croquet to assign to the underlying croquet model object - in the same way for all users - and that the replicated model will then automatically change the same property in each view.

The catch is that each Croquet model object must inherit from Croquet.Model, and each view object must inherit from Croquet.View. This has some limitations:

- A Croquet.Model can contain various Javascript datatypes and application-defined objects that inherit from Croquet.Model, but it cannot arbitrary external objects such as DOM Elements, or types defined by other libraries such as Three.js.
- A particular case of this is that a Croquet.Model cannot have references to a Croquet.View. In our system, we want to track dependencies between the application views and the model, and our implementation of dependency tracking requires that we maintain back pointers the other way.
- In our system, we want view objects to normally be a specific version that comes from some persistent storage, but for users to be able to connect to a session in which some view is being dynamically and collaboratively defined. We want changes to the view-definition session to immediately effect the use of those views. In other words, the same object must be capable of being a view object in one session, but a model object in another.

Here the words "model" and "view" are used differently between the application and the implementation.

The Spec is a Croquet.Model, which keeps a dictionary of properties that is synchronized through Croquet in the normal way. It subscribes to a 'setSpecProperty' Croquet-model event that assigns the property in the dictionary. The handler then fires a 'setRuleModelProperty' Croquet-view event.

The Block is a Croquet.View that subscribes to the 'setBlockModelProperty' event, which sets the property in the block model. The "model" property that is seen from the Block is actually a Proxy that allows reading, but which traps assignments to publish the 'setSpecProperty' event.
