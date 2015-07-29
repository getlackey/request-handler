/*jslint node:true, unparam:true, nomen:true, regexp:true */
'use strict';
/*
    Copyright 2015 Enigma Marketing Services Limited

    Licensed under the Apache License, Version 2.0 (the "License");
    you may not use this file except in compliance with the License.
    You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

    Unless required by applicable law or agreed to in writing, software
    distributed under the License is distributed on an "AS IS" BASIS,
    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
    See the License for the specific language governing permissions and
    limitations under the License.
*/

var fs = require('fs'),
    assert = require('assert'),
    Q = require('q'),
    deep = require('deep-get-set'),
    errors = require('common-errors'),
    optionsParser = require('lackey-options-parser'),
    formatOutput = require('format-obj'),
    handlers = require('./handlers'),
    dummyLogger,
    Obj;

dummyLogger = {
    debug: function () {
        return false;
    },
    trace: function () {
        return false;
    },
    info: function () {
        return false;
    },
    error: function () {
        return false;
    }
};

Obj = function (options, req, res, next) {
    var self = this;

    self.logger = (options.logger === false ? dummyLogger : options.logger || console);

    self.options = {
        // This is the available options for each of these methods
        limit: +options.limit || 100, // max limit per request
        skip: +options.skip || 100, // max limit per request
        select: (options.select && optionsParser(options.select)) || null, // selectable fields
        sort: (options.sort && optionsParser(options.sort)) || null, // sortable fields
        errorsView: options.errorView || 'errors'
    };

    self.req = req;
    self.res = res;
    self.next = next;
};

Obj.prototype.formatOutput = function (opts) {
    return function (data) {
        return (data ? formatOutput(data, opts) : data);
    };
};

Obj.prototype.handleOutput = function (opts) {
    var self = this;

    return function (data) {
        var req = self.req,
            res = self.res,
            options = 'json', // default Media Types Supported
            formatOpts = {},
            deferred;

        function respond(options) {
            options.split(' ').forEach(function (item) {
                var itemProperties = item.split(':'),
                    type = itemProperties.shift(),
                    value = itemProperties.join(':'),
                    handler = handlers[type];

                if (!handler) {
                    throw new errors.NotSupportedError('Invalid Media Type ' + type);
                }

                formatOpts[handler.mediaType] = handler.output({
                    req: req,
                    res: res,
                    data: data,
                    opts: value
                });
            });

            formatOpts['default'] = function () {
                res.status(406).send('Not Acceptable');
            };

            res.format(formatOpts);
        }

        if (!data) {
            return data;
        }

        if (req.method === 'post') {
            res.status(201); //HTTP 201 Created
        }

        if (opts) {
            if (typeof opts === 'function') {
                if (opts.length === 2) {
                    // it's called with the next param
                    // so it's an async call
                    deferred = Q.defer();
                    opts(data, function (options) {
                        respond(options);
                        deferred.resolve(data);
                    });
                    return deferred.promise;
                }

                options = opts(data);
            } else {
                options = opts;
            }
        }

        respond(options);
        return data;
    };
};

Obj.prototype.handle404 = function (opts) {
    var self = this;

    return function (data) {
        var req = self.req,
            res = self.res,
            mediaTypes = (opts && opts.split(' ')) || Object.keys(handlers), // Media Types Supported
            formatOpts = {};
        if (data) {
            return data;
        }

        res.status(404);

        mediaTypes.forEach(function (item) {
            var itemProperties = item.split(':'),
                type = itemProperties[0],
                value = itemProperties[1],
                handler = handlers[type];

            if (!handler) {
                throw new errors.NotSupportedError('Invalid Media Type ' + type);
            }

            formatOpts[handler.mediaType] = handler.notFound({
                req: req,
                res: res,
                opts: value
            });
        });

        formatOpts['default'] = function () {
            res.status(406).send('Not Acceptable');
        };

        res.format(formatOpts);

        // allows other listeners to be defined
        // but they will never run
        return (function fakePromise() {
            return {
                then: fakePromise
            };
        }());
    };
};

Obj.prototype.handle404.callNext = function () {
    var self = this;

    return function (data) {
        if (data) {
            return data;
        }

        self.next();
    };
};

Obj.prototype.handleError = function () {
    var self = this;

    return function (err) {
        var errObj = {
            name: err.name || 'InternalError',
            message: err.message || 'An unexpected error has occurred.',
            errors: err.errors || undefined,
            status: err.status
        };

        if (!err) {
            return;
        }

        self.logger.error('Error Handled', err);
        if (!err.status) {
            switch (err.name) {
            case 'CastError':
            case 'ValidationError':
            case 'ArgumentError':
            case 'ArgumentNullError':
            case 'RangeError':
            case 'TypeError':
                errObj.status = 400;
                break;
            case 'AuthenticationRequiredError':
                errObj.status = 401;
                break;
            case 'NotPermittedError':
                errObj.status = 403;
                break;
            case 'NotFoundError':
                errObj.status = 404;
                break;
            case 'NotSupportedError':
                errObj.status = 415;
                break;
            case 'MongoError':
            case 'AlreadyInUseError':
                errObj.status = 409;
                break;
            default:
                errObj.status = 500;
            }
        }

        self.res.status(errObj.status);

        self.res.format({
            'text/html': function () {
                self.res.render(self.options.errorsView, errObj);
            },
            'application/json': function () {
                self.res.json(errObj);
            }
        });
    };
};


Obj.prototype.getBody = function () {
    var self = this,
        files = self.req.files,
        body = self.req.body,
        fileNames = (files && Object.keys(files)) || [],
        file,
        deferred = Q.defer(),
        err;

    // data in the uploaded file will be parsed and all properties 
    // in req.body will overwrite the ones in the file
    if (files && files.length > 0) {
        //hack catching any errors
        deferred.promise.then(null, function (err) {
            var errorHandler = self.handleError();
            return errorHandler(err);
        });

        if (fileNames.length > 1) {
            throw new errors.Error('Only one file can be submitted at each time');
        }

        file = files[fileNames[0]]; //the first (only) file in the files object

        switch (file.mimetype) {
            // case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
            //     converter = new JsonXlsxConverter();
            //     converter.readXlsxFile(file.path)
            //         .then(function (self) {
            //             data = self.convertToJson().json;
            //             //merge with req.body
            //             Object.keys(body).forEach(function (key) {
            //                 // body properties are not overwritten
            //                 if (data[key] === undefined) {
            //                     data[key] = body[key];
            //                 }
            //             });
            //             deferred.resolve(data);
            //         }).fail(function (err) {
            //             deferred.reject(err);
            //         });
            //     break;

        case 'application/json':
            fs.readFile(file.path, 'utf8', function (err, data) {
                var parsedData;

                if (err) {
                    return deferred.reject(new errors.io.FileNotFoundError(file.path, err));
                }

                parsedData = JSON.parse(data);
                //merge with req.body
                Object.keys(body).forEach(function (key) {
                    // body properties are not overwritten
                    if (parsedData[key] === undefined) {
                        parsedData[key] = body[key];
                    }
                });
                deferred.resolve(parsedData);
            });
            break;

        default:
            err = new errors.TypeError('Unrecognized file type ' + file.type);
            deferred.reject(err);
            throw err;
        }

    } else {
        // if no valid file is found we return the body
        deferred.resolve(body);
    }

    return deferred.promise;
};

Obj.prototype.getFilter = function (opts) {
    var self = this,
        options = optionsParser(opts).makeArray(true),
        filter = {},
        paramNames = options.getKeys(),
        $orFilters = [];

    paramNames.forEach(function (paramName) {
        var paramValue = self.req.params[paramName],
            fields = [],
            filters = [];

        if (!paramValue) {
            throw new errors.ArgumentNullError(paramName);
        }

        // Check types and exclude from the query the ones that
        // would throw an exception when casting
        fields = options[paramName]
            .map(function (item) {
                // check if has a type definition
                var match = item.match(/(.+)\((.+)\)/),
                    type,
                    name;

                if (!match) {
                    return item;
                }
                type = match[1];
                name = match[2];

                switch (type) {
                case 'ObjectId':
                    if (!/^[a-fA-F0-9]{24}$/.test(paramValue)) {
                        return null;
                    }
                    break;
                case 'Date':
                    if (isNaN(+new Date(paramValue))) {
                        return null;
                    }
                    break;
                default:
                    return null;
                }

                return name;
            })
            .filter(function (item) {
                return (item !== null);
            });

        if (fields.length === 0) {
            throw new errors.TypeError('The value provided is not valid for ' + paramName);
        }

        if (fields.length === 1) {
            filter[fields[0]] = paramValue;
            return;
        }

        fields.forEach(function (field) {
            var f = {};
            f[field] = paramValue;
            filters.push(f);
        });

        if (filters.length !== 0) {
            $orFilters.push(filters);
        }
    });

    if ($orFilters.length === 1) {
        filter.$or = $orFilters[0];
    } else if ($orFilters.length > 1) {
        filter.$and = $orFilters.map(function (items) {
            return ({
                $or: items
            });
        });
    }

    return filter;
};

Obj.prototype.find = function () {
    var self = this,
        find;

    function reviver(key, value) {
        // revive date
        if (typeof value === 'string') {
            var a = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2}(?:\.\d*)?)Z$/.exec(value);
            if (a) {
                return new Date(Date.UTC(+a[1], +a[2] - 1, +a[3], +a[4], +a[5], +a[6]));
            }
        }
        return value;
    }

    find = (self.req.query.find && JSON.parse(self.req.query.find, reviver)) || {};

    return find;
};


Obj.prototype.select = function (opts) {
    var self = this,
        fields = (opts && opts.split(' ')) || [],
        select = self.req.query.select,
        include = self.req.query.include,
        exclude = self.req.query.exclude,
        whiteList = (self.options.select && self.options.select.getKeys()) || null,
        excludeWithDash = false;

    // replace the default fields with the select content
    if (select) {
        fields = select.split(',');
        // is field valid?
        if (whiteList && whiteList.length > 0) {
            fields.forEach(function (field) {
                if (whiteList.indexOf(field) === -1) {
                    throw new errors.ArgumentError('Using ' + field + ' in the select isn\'t supported');
                }
            });
        }
    }

    if (include) {
        include.split(',').forEach(function (field) {
            if (fields.indexOf(field) === -1) {
                // is field valid?
                if (whiteList && whiteList.length > 0 && whiteList.indexOf(field) === -1) {
                    throw new errors.ArgumentError('Using ' + field + ' in the select isn\'t supported');
                }

                fields.push(field);
            }
        });
    }

    if (exclude) {
        exclude.split(',').forEach(function (field) {
            var index = fields.indexOf(field);

            if (fields.indexOf(field) > -1) {
                fields.splice(index, 1);
            } else if (excludeWithDash || fields.length === 0) {
                // when the fields list is empty we start using the dash
                // to exclude fields
                excludeWithDash = true;
                // no need to check if a field is supported if it's
                // being excluded form the selection
                fields.push('-' + field);
            }
        });
    }

    return fields.join(' ');
};

// uses the querystring param "sort" or the default 
// opts, when provided
Obj.prototype.sort = function (opts) {
    // sort=+id,-_timestamp
    // gets converted to 
    // {id: 1, _timestamp:-1}
    var self = this,
        req = self.req,
        whiteList = (self.options.sort && self.options.sort.getKeys()) || null,
        sort = req.query.sort || opts,
        s = {};

    if (sort) {
        sort.split(',').forEach(function (item) {
            var name = item,
                direction = item.charAt(0);

            if (direction === '-' || direction === '+') {
                name = name.substring(1);
                if (direction === '-') {
                    s[name] = -1;
                    return;
                }
            }
            s[name] = 1;
        });
    }


    if (whiteList) {
        Object.keys(s).forEach(function (name) {
            if (whiteList.indexOf(name) === -1) {
                throw new errors.ArgumentError('Fields ' + name + ' is not sortable.');
            }
        });
    }

    return s;
};

Obj.prototype.limit = function (defaultLimit) {
    var self = this,
        limit = +self.req.query.limit || defaultLimit;

    if (limit > self.options.limit || defaultLimit > self.options.limit) {
        throw new errors.RangeError('limit (' + limit + ') is over the max (' + self.options.limit + ')');
    }

    return limit;
};

Obj.prototype.skip = function () {
    var self = this,
        maxSkip = self.options.skip,
        skip = +self.req.query.skip || 0;

    if (maxSkip && skip > maxSkip) {
        throw new errors.RangeError('Skip has a maximum limit of ' + maxSkip);
    }

    return skip;
};

// At the moment converts a CSV param in the querystring into an Array
// may be extended to support other formats
Obj.prototype.parseParam = function (key) {
    var self = this;

    if (self.req.query[key]) {
        self.req.query[key] = self.req.query[key].split(',');
    }
};

module.exports = function handler(options, cb) {
    return function (req, res, next) {
        var o, errHandler;

        if (!cb) {
            cb = options;
            options = {};
        }

        o = new Obj(options, req, res, next);

        try {
            cb(o);
        } catch (err) {
            errHandler = o.handleError();
            errHandler(err);
        }
    };
};