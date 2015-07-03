/*jslint node:true, regexp:true */
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

var errors = require('common-errors');

function outputHandler(obj) {
    return function () {
        var res = obj.res,
            data = obj.data,
            opts = obj.opts, // template name or redirect url
            matchRedirect = opts.match(/redirect\(([^\)]+)\)/);

        if (matchRedirect) { // absolute urls only
            if (!/^https?:\/\//.test(matchRedirect[1])) {
                throw new errors.URIError('Redirection URL needs to include the protocol (http or https).');
            }
            return obj.res.redirect(matchRedirect[1]);
        }

        if (data instanceof Array) {
            data = {
                items: data
            };
        }

        res.render(opts, data);
    };
}

function notFoundHandler(obj) {
    return function () {

        var res = obj.res,
            opts = obj.opts; // template name

        res.render(opts || 'errors/404', {});
    };
}

module.exports = {
    mediaType: 'text/html',
    output: outputHandler,
    notFound: notFoundHandler
};