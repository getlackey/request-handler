# Lackey Request Handler
Helps creating compact request handlers for express/mongoose.

Exposing basic CRUD operations becomes easier as the module parses the requested URL exposing basic mongoose methods like **find**, **limit**, **sort**, etc. The user input is validated against the limits defined in the handlerOptions for some additional security. 

Error handling and supporting multiple mime type responses is simplified, while still allowing some degree of control. Each of these behaviours may be disabled just by replacing the method call with some other custom function as it's all express/mongoose compatible. The **req**, **res** and **next** functions can be found as properties in the **o** object - **o.req**, **o.res** and **o.next**.

## Basic Usage

```
router.get('/',
    handler(function (o) {
        MongooseModel
            .find(o.find())
            .select(o.select())
            .sort(o.sort('-_id'))
            .limit(o.limit(20))
            .skip(o.skip())
            .lean(true)
            .exec()
            .then(o.formatOutput('_id:id author.email author.name author.group createdAt'))
            .then(o.handleOutput('html:my-template json'))
            .then(o.handle404(), o.handleError());
    }));
```
The values provided to the sort and limit function are just defaults. The user may provide other values.

## With Options

```
var handlerOptions = {
	 // if not provided console will be used. providing false disables loggin
    logger: myLogger,
    // max items per page
    limit: 100,
    // max skip to prevent DB abuse
    skip: 100000,
    // max selectable fields
    select: 'id title author.email author.name author.group createdAt',
    // sort fields that are sortable
    sort: 'id createdAd, title',
    errorsView: 'errors'
};

router.get('/',
    handler(handlerOptions, function (o) {
        MongooseModel
            .find(o.find())
            .select(o.select())
            .sort(o.sort('-_id'))
            .limit(o.limit(20))
            .skip(o.skip())
            .lean(true)
            .exec()
            .then(o.formatOutput('_id:id author.email author.name author.group createdAt'))
            .then(o.handleOutput('html:my-template json'))
            .then(o.handle404())
            .then(null, o.handleError());
    }));
```
If the user chooses to provide options to the API those may be limited by the handlerOptions object. An error will be return if the options provided are not allowed.


## Methods

### o.find
Specifies selection criteria using mongo [query operators](http://docs.mongodb.org/manual/reference/operator/). The query needs to be provided as a valid JSON string.

In the next example whatever query is provided in the query string will be used:

```
  Product
    .find(o.find())
    .exec()
```
we can now use **?find={"createdAt":{"$gt":"2011-06-01T09:58:56.793Z"}}** and it would return products created after 2011-06-01 at 09:58:56.793 UTC.

Sometimes we need to lock some query criteria, like forcing the locale:

```
var merge = require('merge');

Product
  .find(merge(o.find(), {
    locale: 'en_GB'
  }))
  .exec()
```

### o.select
The select method defined the fields that are return, by default. The user may override this setting by using any one of these parameters in the query string:

- select
- include
- exclude

**Select** completely replaces the selected fields. **Include** adds to the selection and **exclude** removes them. **Exclude** always prevails over the other two.

The fields allowed in a select may be restricted by the request-handler options. An error will be presented if an unauthorized field is used.

Let's show an example:

```
//no spaces between the fields
?select=title,name&include=createdAt
```
This would set the select query as **'title name createdAt'**. 

### o.sort(:defaultSort)
Set's the default sorting allowing the user to override it. The list of sortable fields may be defined in the global options.

### o.limit(:defaultLimit)
Allows user to define the number of elements per request. There may be a maximum limit in place in the global options.

### o.skip()
Skip enables the user to provide a skipping value for pagination. Skip is a [fairly expensive](http://docs.mongodb.org/manual/reference/method/cursor.skip/) database operation so there is a skip limit option in the global options to prevent abuse to the server.

### o.formatOutput(:outputOptions)
Limits the properties available in the response and renames any of those. It uses a compact properties format. * indicates that any other property is allowed with it's original name.

```	
	o.formatOutput('_id:id author.email')
```

or, to rename _id and allow all other properties

```
	o.formatOutput('_id:id *')
```

### o.handle404()
This method takes care of the case when there is no document to render in the handle output method. We can call it with no arguments and the default error will be shown to all media types and the template errors/404 will be used for HTML.

Default usage:

	MongooseModel
       .find(o.find())
       .lean(true)
       .exec()
       .then(o.handleOutput('html:my-template json'))
       .then(o.handle404(), o.handleError());
       
Custom Template:

       .then(o.handle404('html:special-error-tpl json'), o.handleError());

Call **next** middleware if no document is found:

		.then(o.handle404.callNext(), o.handleError());

### o.handleError
Tries to catch any errors and render them in a consistent manner.

### o.parseParam
At the moment converts a CSV param in the querystring into an Array
may be extended to support other formats.

```
o.parseParam('tags');
```

that will parse **?tags=media,mobile,app** and replace the variable **o.req.query.tag** with an array:

```
[media, mobile, app];
```

### o.handleOutput
Takes care of writing the response to the HTTP request.

```
    .then(o.handleOutput(html:my-template json))
```

Receives a list of supported media types as an argument. Some of them, as html, have options. The default html option is the template to be used when rendering. 

Some routes, like the /session, may need to redirect the user for html responses, but return a JSON response otherwise.


```
    //redirecting an html form submission
    .then(o.handleOutput(html:redirect(http://www.google.com) json))
```

### o.getBody
Merges the content of any uploaded file, depending on its media type, into the body object. Any property in the body takes precedence.

    o.getBody().then(function (doc) {
        MongooseModel
            .create(doc)
            .then(o.formatOutput('_id:id'))
            .then(o.handleOutput('html:new-item-tpl json'))
            .then(o.handle404(), o.handleError());
    });

### o.getFilter
Utility to build the select query from (multiple) path params. Accepts all formats supported by the [lackey options parser](https://www.npmjs.com/package/lackey-options-parser).

**Basic usage**

```
.findOne(o.getFilter('id:ObjectId(_id)'))

// returns:
// { '_id': o.req.params['id'] }
```

**Basic, multiple options per param**

```
.findOne(o.getFilter('id:ObjectId(_id),slug'))

// returns:
// { 
//     $or: [
//         {'_id': o.req.params['id']},
//         {'slug': o.req.params['id']}
//     ]
// }
```

**Basic, multiple params**

```
.findOne(o.getFilter('id:ObjectId(_id) slug'))

// returns:
// { 
//     '_id': o.req.params['id'],
//     'slug': o.req.params['slug']
// }
```

**Multiple properties per param**

```
.findOne(o.getFilter('type section:section.slug,ObjectId(section._id) subSection:subSection.slug,ObjectId(subSection._id)'))

// could also be written as:
.findOne(o.getFilter({
    type: ['type'],
    section: ['section.slug', 'ObjectId(section._id)'],
    subSection: ['subSection.slug', 'ObjectId(subSection._id)']
}))

// returns:
// { 
//     type: o.req.params['type'],
//     $and: [
//           {$or: [
//               {'section.slug': o.req.params['section']},
//               {'section._id': o.req.params['section']}
//           ]},
//           {$or: [
//               {'section.slug': o.req.params['section']},
//               {'section._id': o.req.params['section']}
//           ]}
//     ]
// }
```

Be carefull in setting your DB indexes right: http://docs.mongodb.org/manual/reference/operator/query/or/


#### types
We may need to provide additional info regarding types, otherwise an exception would be thrown by mongoose when trying to convert the value. 

If some value can't be converted to the defined type the property will be excluded from the search.

types:
  - ObjectId
  - Date

**example**
```
.findOne(o.getFilter('id:ObjectId(id),Date(timestamp)'))
```