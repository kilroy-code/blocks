# Replicated

Uses Croquet to keep models in sync among all users.

### From an application perspective:

Every application object is a Block, which has one named 'model' property and any number of view properties. The model is synchronized among all the concurrent users: any assignment to a property in the model will make the same change in the model for all users. The model properties can be read by any code.

Assignment of block model properties is not immediate. I.e., you make the assignment to the model property and it goes through the Croquet reflector before the value actually changes in the block model. There is a property on the block called 'ready' that answers a promise that fullfils as soon as there are no outstanding assignments on the block. For example, you might update a number of block properties all at once - or maybe some of them several times in a stream of changes. When you are done, you can call 'ready()' and await its resolution before reading examing the new state.

The Block also has a property named 'spec', which is a POJO that always contains all and only the assigned rules of the model. (It does not contain any rule value that was computed by the rule's default formula, or which has not been demanded.)  The spec is not writeable.

### Implementation, from a Croquet perspective:

The words "model" and "view" are used differently between the application and the implementation.

The Spec is a Croquet.Model, which keeps a dictionary of properties that is synchronized through Croquet in the normal way. It subscribes to a 'setSpecProperty' Croquet-model event that assigns the property in the dictionary. The handler then fires a 'setRuleModelProperty' Croquet-view event.

The Block is a Croquet.View that subscribes to the 'setBlockModelProperty' event, which sets the property in the block model. The "model" property that is seen from the Block is actually a Proxy that allows reading, but which traps assignments to publish the 'setSpecProperty' event.
