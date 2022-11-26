# Blocks

> Abstract: Blocks provide a basic unit of abstraction by which end-users can interactively create live multi-user Web applications as they are running those applications, using separately written code for local-only visual and interactive behavior. It does not use an application server.

A Block is a generic object that can be composed, decomposed, and modified in a Web browser.
- Arbitrarily named "sessions" can be created. Users can come and go from the session, and each will recreate the same Block structure, which will stay in sync for each user as properties are changed, and as Blocks are added and removed.
- Each Block may have components that represent various views of the data - either external objects such as DOM Elements, a Three.js Mesh, etc. - or the compnents may be other Blocks that are synchronized by other sessions concurrently with the first.


A Block consists of one "model", and zero or more other components:
- The model is what stays in sync. There are no restrictions on how the model is implemented - it can inherit from any class - but it is treated as a bag of properties. When a property is set, all the session participants will have the same property set in their model.
- The components can be other Blocks, or they can be opaque external objects.
The components are built automatically on-demand from the information in the model.
When components are other Blocks, their models can be replicated in the same session, in different sessions, or they can not be part of any session at all.
Typically, the components are displayed to the user, with event handlers that set the properties of the model (which is then automatically replicated among all users in the session).
- Internally, there is also a "spec", which is a JSON-serializable Plain-Old Javascript Object (aka a POJO), that represents all the non-default values of the model. This is what is used to replicate the model, and can be serialized to externalize the model outside the session.

You can think of a Block as being like an atom or cell, and the model as the nucleus. (The spec is like DNA.)

You can also think of the model and the other components as being like a model and various views. External components and their handlers, and the Block machinery itself, are like a controller in a Model-View-Controller architecture (aka MVC). However, unlike MVC, a Block can be both a "model" and a "view" - e.g., a Block can have a "view" component that is another Block and thus has its own model.

When an application goes offline and rejoins, the local model "catches up" to any changes made by others. In addition, if the local user can make local changes while offline, and these changes are applied when the user rejoins the session. The same mechanism can be used to make "recordings" that animate or automate groups of Blocks.


## API

## Implementation



## Internal notes

purpose is to make models work identically in each participant, so that a change to any property is matched by all participants
to do this without message storms, we need to distinguish  between internal and external messages, example between views and models vs model to model. 
Talk about not knowing senders and the that it's the external sender.
Could maybe partition in time, so that externally-driven state is done in one step and then internal response is done a separate step without wire messages.
We use proxies...

problems requiring disciplined modeling:
- Identity: Identity of an object cannot depend on it's parent, else it cannot be used in multiple places. But what does "depend" mean? The object CAN take an input (like 'content' or 'parent') and have computed values that depend on that input. The computed values are not part of the identity. However, those computations cannot have side-effects that assign identity values.
- Session: To prevent message storms, we must be able to distinguish between internal and external messages. With that distinction modeled by proxies, a block can directly refer to other blocks within it's session, but must not have access to anything outside. Meanwhile, blocks outside of any session must refer to other blocks only through proxies.

problem: (block.model.someChild.someProperty = newValue)   ...will only be replicated if someChild is a proxy.
So it has to be included in the assembly children in Block and CroquetModel.
That will be the case for any children created by assignment in the session, but not by those created by internal rules invoked by constructor.
I.e., all actions taken by constructor code will be properly replicated, but the explicit recognition of children only happens in the Block.
There are a couple of potential ways to deal with this:
- Prohibit it. Insist that initial spec be fully expanded. After all, our persistence spec will reference identityTags that also need to be expanded.
- Recognize it in some way, and treat recognized internally-generated children as if they were explicitly in the spec:
  -- Enumerate properties (of instance and all through prototype chain because prototype properties are not own enumerables) and detect (how?) those that can be made explicit.
  -- Ask some object (which? model?) for its expanded spec, and somehow (how?) do a local "re-initialize" based on that.
Proposed: don't solve this yet (effectively "prohibiting" it for now) until we build persistence. E.g., we're going to eventually have a running session in which a user asks the root to "undo" back to a previous identityTag within the session. Let's use that use-case to figure it out. E.g., maybe we tear everything down except for a placeholder root (that isn't externally persisted and just has the identityTag of the root object), and fetch the root object, and then expand it one step at a time with explicit assignments. Who does that as as to avoid an update storm?

problem: which is maybe part of the answer to the previous....
How do we get the right effects wrt children from internal messages.
Possible answer involves setting parent.
Possible answer - createModel?


root:Block:#A

  template:Pair:#1
    child1:Positioned:#2

  display:Body
    display:<body>
  
  child1:Block:#B
    template:Positioned:#2
    
    display:Box
      display:<div>
      block:#B
      
    Xdisplay:Block#C
      template:Box:#3
        block:#C
	model:#2  or is this always going to be block.parent.model ?
      display:<div>

/content/
  /content/child1/

/interactor/
  display:<body>
  
  /interactor/box1/
    content:/content/child1/
    display:<box>
    
    /interactor/box1/pointerdown/
      content:/interactor/box1/
      
      
philisophical:
- What is the narrowest feedback mechanism that meets our needs (e.g., around creation, destruction, changing parent, changing geometry)?
- What are the minimum responsibilities & guarantees, and how can they be separated/orthogonalized to remain robust?

yin and yang of what and why:
purpose: component semantics for model & views, in which even display Blocks can be synchronized. (spatial recursion: turtles all the way down)
connection: Rules allow dynamic combination (e.g., attachment) of models and views, internally keeping track of dependencies in a principled way.

metacircularity

does not depend on or require Rules, but is designed with them in mind.
model - a graph of instances that have behavior (e.g., some combination of rules, methods, and state)
spec - a JSON-serializable form of the model. e.g., all the information necessary to reproduce the model.
       In ki1r0y, this means all the assigned values overriding the rule behavior - i.e., the non-default behavior.


A block may be online or off:
  When online, it is connected to Croquet session and the block's model stays in sync with all other online users.
  When offline, changes are captured so that they can be replayed to the session when the block comes online again:
    For anything not owned by a team (and most of the time even then), no one else has changed anything while the author was offline.
    Otherwise, a team composition might have been changed. The approach is to make the changes (creating or recreating missing object as needed), and let people sort it out just as they would for changes made online while the other owner was absent.
The transition from offline to online is fraught. We make no attempt to merge results. Instead, the online session is always the basis, and any recorded offline changes are played against it as if they were new.

When a Croquet session suspends, it always tears down all the view code, and then recreates it when it comes online. If nothing has changed, that would look the same, but if it has changed, the Croquet or user code would be in the position of trying to figure out how to merge them. Thus a pause/resume will have the views torn down and recreated by Croquet, and we wouldn't be able to use them even if we thought we could. We take the same approach with offline/online - tearing everything down and recreating from the spec.


spec - serializable form of model, used by CroquetModel and persistence.
- POJO used directly for "children". No class and no assembly.
- Cannot reference non-specs.
- For now, embeds child specs directly, but later that might be "input specs" with a hash.

model - The live data to be synchronized.
- Created from spec, using registered 'type' property of spec. No common base type (can even be type:'Object').
- The model must see only other models (no Blocks, Proxies, etc.)

Block - A packaging of the model and spec, plus any active views (other blocks), and external components (such as displays, event handlers, or Synchronizers).
- assembly: parent, and named child collection:
  The model may have arbitrarily named properties whose values are other models - i.e., "child" models.
  Some block operations need to identify whether a model property name is one of these, and some need to identity that other model that has a given model as a named child - i.e., "parent" model.
  However:
    The block may actually need to know the corresponding child block or parent block, rather than the model, and the model cannot contain any block references.
    The child names could be anything, including the same names as other block properties.
    The model children can be of any time, with new specific base class, so there is no instanceof test for whether a given property names a child.
  So, Blocks have an assembly property, of type Assembly.
  CroquetModel also has an assembly property, in which the parent/children are other CroquetModels (which cannot refere to Blocks or models).
- Any Block in the hierarchy can define a recording for all descendent blocks to use. A block may be part of multiple simultaneous recordings.
  We don't want each recordable action to have to look up the parent chain for all recorders, so there are methods to addRecorder/removeRecorder for all descendants.
- synchronizer property:
  self when offline
  a Synchronizer (Croquet.View) when connected.
- The model property is a proxy:
  A property read is intercepted IFF the property names a child, in which case the child block's model proxy is returned. Thus assignments to THAT are intercepted.
    The underlying model cannot have child properties that are proxies, because then model-to-model assignments through a child would cause an update storm on the network.
  There are three steps for assignment:
    Add {block, key, value, timestamp} to all the Blocks recorders.
    synchronizer.setSpecProperty updates the corresponding spec, if any (deleting the property if the value is undefined), and arranging for setModelProperty to be invoked.
      If offline (synchronizer === self)
      	No need to modify spec, as it is not used offline.
	call setModelProperty.
      If online, publish setSpecProperty from the Synchronizer:
        Subscribed by CroquetModel, which....
	Sets/deletes from it's spec:
	  As a special case, if key is 'parent', don't set the property (specs don't have a parent property),
	    If there's an old parent, remove us from its assembly and spec.
	    If there's a new parent, add our name as a child of the new parent, and our our spec as property in new parent's spec.
	  If the key names an existing child, destroy it.
	  Set the spec value.
	  If value is an object with a 'type' property, create the tracked child object with the value as args, and named by key.
	(To destroy a CroquetObject, remove from parent assembly and spec, and destroy its children.)
	Publishes setModelProperty, which is subscribed by corresponding Synchronizer and calls same on the block (which means the Synchronizer must know it's block).
    setModelProperty, which actually sets the underlying model's value.
      roughly: same as CroquetModel.setSpecProperty, but
        assigning expanded-to-model values to model
	adding/removing block children.
	creating synchronizers if online.
- When we join a session:
  The session block root will conform to the new session state, not the old offline state.
  The recordings will reference old blocks that may or may not appear in the new session blocks.
  When we create Sychronizer, we re-use the existing Block by croquetModel id, if any. (This means the session map of id => Block must not be cleared when we leave or pause the session.)
  New Synchronizers and new Blocks are created at the same time by setModelProperty.

model can reference parent, child
model does not reference views, block IF the model is replicated (because the properties of block may be different for different users).
  How do we model views that reference display?
    Maybe display is special? Maybe block and/or display is a proxy within model?
    Maybe it just can't assign a display, but can still reference it?
    => Actions are imperitive code that happens on an individual user's system, often causing replicated assignments to the model, as well as other local-only changes.
       Actions are attached to blocks as components, in which the model describes some parent path defining inheritance. E.g., a root view block defining a DOM hierarchy.
       Creating a block invokes the display action. For a DOM heirarchy, this creates the model (and attaches it?), uses that to discover what kind of DOM Element to create,
         creates the Element and assigns it to the block, and updates it.
       Action handlers have access to the block (how...?) and can do things to the display. (Maybe the DOM event handler closes over the block? In any case, I don't think
         we want or need for external components to have references to the block. Be sure to remove handlers when detaching!)
       ?? But how does rules involving update access the display????
block references each component (but reference to model is actually a proxy that either stores or broadcasts assignments)
block does not reference parent, child (meaningless, as different components have different parent/child relationships)
model produces spec?
block produces block/model from spec?
  Does it "add" the block (as a component) or model (as a child)
  Is that the same for a component and a child? How do we know which to do?
  Is there a difference between assigning spec value to a model, vs attaching a component?
  How is it hooked/customized? E.g., dynamically attaching a tracking rule in the model if one does not already exist
when changing a model node from one parent to another, is that...
  a single assignment of a new value for parent?
  or a reset of previous parent's name value followed by an assignment of a new parent's name value?
  => I think we need to distinguish between deleting a node vs resetting property vs deleting a property
adding component to a block must be lazy/demand-driven, and not occur merely because the model has specified how. (Otherwise we'll have infinite expansions.)
   Maybe each component's 'block' property is actually a proxy that expands refererences when not already cached?
   We don't always want to always add something locally - e.g., it ought to be possible to specify a delegating event handler at the root (of what? a view tree?) that will handle events on lower nodes, without actually creating the handler on the lower nodes.
      Maybe expanding a requested property either does not look up tree,
      or maybe it looks up tree to find the info for expanding, but then adds it where that info is rather than on the receiver?


issue: 1. croquet has model/view, but the same object cannot be both. 2. croquet models cannot be arbitrary instances (such as DOM elements or Rules) -- Actually, a Croquet.Model CAN reference a Rule, but it cannot reference a Rule that also references Crqouet.View objects.
So...
- Each Block has one model, that is synchronized through Croquet. (Also saves changes when offline so that it can be rejoined to session when it comes online again.)
- Each Block can have zero or more other components attached to it (or removed from it), that are themselves either Blocks or opaque external objects (such as DOM elements).
- Any Block can be synchronized through Croquet to exactly one Croquet session, which synchronizes the model only (ignoring the other components). There can be multiple Croquet sessions, with some Blocks belonging to one Session, and other Blocks belonging to another Session.

A typical pattern is:
- Application has two display areas:
   -- A content area that is the same "content" for each user, although individual users have different scroll positions, camera rotations, etc.
   -- An inspector area that is specific to each user, allowing each to inspect one of the objects in the content.
      Changes to properties in the inspector are instantly reflected in the content area dispaly for all users.
- Each object in the application is a Block:
  -- The Block's model has rules that specify the model's properties and the Rules for how they interact. The Block machinery arranages to automatically keep this model in sync, such that changes to any such model property are reflected among all the Session's particpants. For example, maybe there is such a property called "label" whose value is a string.
  -- The content view is another Block, whose model specifies how it is displayed. For example, it might be a span of inline text, whose display always refelects the value of the the model.text. The content Block itself has an external component that is the DOM SPAN Element.  In this example, this content view Block is not connected to a Croquet Session.
  


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
-----------
/
  synchronized
    chat
    content
      section
        heading
	paragraph
    avatars
      me
      you
  private
    scene
    inspector
    chatlog
    