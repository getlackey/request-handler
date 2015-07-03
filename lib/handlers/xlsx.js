/*jslint node:true */
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

var JsonXlsxConverter = function () {
    return true;
};
//require('json-xlsx-converter')

function outputHandler(obj) {
    return function () {
        var res = obj.res,
            data = obj.data,
            converter = new JsonXlsxConverter();

        converter.json = data;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        //res.setHeader("Content-Disposition", "attachment; filename=" + "Report.xlsx");
        res.send(new Buffer(converter.convertToXlsx().xlsx, 'binary'));
        res.end();
    };
}

function notFoundHandler(obj) {
    return function () {
        var res = obj.res,
            data = {
                message: 'Data wasn\'t found',
                name: 'dataNotFound'
            },
            converter = new JsonXlsxConverter();

        converter.json = data;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        //res.setHeader("Content-Disposition", "attachment; filename=" + "Report.xlsx");
        res.send(new Buffer(converter.convertToXlsx().xlsx, 'binary'));
        res.end();
    };
}

module.exports = {
    mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    output: outputHandler,
    notFound: notFoundHandler
};