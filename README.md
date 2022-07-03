# Blocks

Uses Croquet to keep models in sync among all users.


### From an application perspective:

Every application object is a Block, which has one named 'model' component and any number of view components. The model is synchronized among all the concurrent users: any assignment to a property in the model will make the same change in the model for all users. The model's properties can be read by any code.

Assignment of block model properties is not immediate. I.e., you make the assignment to the model property and it goes through the Croquet reflector before the value actually changes in the block model. There is a property on the block called 'ready' that answers a promise that fullfils as soon as there are no outstanding assignments on the block. For example, you might update a number of block properties all at once - or maybe some of them several times in a stream of changes. When you are done, you can call 'ready()' and await its resolution before reading examing the new state.

The Block also has a property named 'spec', which is a POJO that always contains all and only the assigned rules of the model. (It does not contain any rule value that was computed by the rule's default formula, or which has not been demanded.)  The spec is not writeable.

### Implementation, from a Croquet perspective:

Croquet keeps its model objects in sync: a change to any user's replica is reflected in all replicas, and late-joiners quickly get a matching replica.

Croquet has a very flexible mechanism by which an application can define how each model object causes zero or more corresponding view objects to be created, perhaps differently for different users. It is fairly easy to build a generic framework on top of this mechanism in which changes to a view automatically drive changes to the model, which then reflects back to each view. This is, roughly, our goal.  For example, we can arrange for each view object to have a proxy to a corresponding model object, such that when a view assigns a model object property, the framework automatically asks croquet to assign to the underlying croquet model object - in the same way for all users - and that the replicated model will then automatically change the same property in each view.

The catch is that each Croquet model object must inherit from Croquet.Model, and each view object must inherit from Croquet.View. This has some limitations:

- A Croquet.Model can contain various Javascript datatypes and application-defined objects that inherit from Croquet.Model, but it cannot arbitrary external objects such as DOM Elements, or types defined by other libraries such as Three.js.
- A particular case of this is that a Croquet.Model cannot have references to a Croquet.View. In our system, we want to track dependencies between the application views and the model, and our implementation of dependency tracking requires that we maintain back pointers the other way.
- In our system, we want view objects to normally be a specific version that comes from some persistent storage, but for users to be able to connect to a session in which some view is being dynamically and collaboratively defined. We want changes to the view-definition session to immediately effect the use of those views. In other words, the same object must be capable of being a view object in one session, but a model object in another.

Here the words "model" and "view" are used differently between the application and the implementation.

The Spec is a Croquet.Model, which keeps a dictionary of properties that is synchronized through Croquet in the normal way. It subscribes to a 'setSpecProperty' Croquet-model event that assigns the property in the dictionary. The handler then fires a 'setRuleModelProperty' Croquet-view event.

The Block is a Croquet.View that subscribes to the 'setBlockModelProperty' event, which sets the property in the block model. The "model" property that is seen from the Block is actually a Proxy that allows reading, but which traps assignments to publish the 'setSpecProperty' event.
