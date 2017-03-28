/**
 * Copyright 2014 IBM Corp. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var extend = require('extend');
var request = require('request');
var pkg = require('../../package.json');
var helper = require('./helper');
var parseString = require('string');
var readableStream = require('stream').PassThrough;
var isBrowser = (typeof window === 'undefined' ? 'undefined' : _typeof(window)) === 'object';

/**
 * @private
 * @param {String} path
 * @param {Object} params
 * @return {String}
 */
function parsePath(path, params) {
  if (!path || !params) {
    return path;
  }
  var escapedParams = {};
  Object.keys(params).forEach(function (value) {
    escapedParams[value] = encodeURIComponent(params[value]);
  });

  return parseString(path).template(escapedParams, '{', '}').s;
}

/**
 * Check if the service/request have error and try to format them.
 * @param  {Function} cb the request callback
 * @private
 */
function formatErrorIfExists(cb) {
  return function (error, response, body) {
    // eslint-disable-line complexity

    // If we have an error return it.
    if (error) {
      // first ensure that it's an instanceof Error
      if (!(error instanceof Error)) {
        body = error;
        error = new Error(error.message || error.error || error);
        error.body = body;
      }
      cb(error, body, response);
      return;
    }

    try {
      body = JSON.parse(body);
    } catch (e) {}
    // if it fails, just return the body as a string


    // If we have a response and it contains an error
    if (body && (body.error || body.error_code)) {
      // visual recognition sets body.error to a json object with code/description/error_id instead of putting them top-left
      if (_typeof(body.error) === 'object' && body.error.description) {
        var errObj = body.error; // just in case there's a body.error.error...
        Object.keys(body.error).forEach(function (key) {
          body[key] = body.error[key];
        });
        body.error = errObj.description;
      }
      // language translaton returns json with error_code and error_message
      error = new Error(body.error || body.error_message || 'Error Code: ' + body.error_code);
      error.code = body.error_code;
      Object.keys(body).forEach(function (key) {
        error[key] = body[key];
      });
      body = null;
    }

    // If we still don't have an error and there was an error...
    if (!error && (response.statusCode < 200 || response.statusCode >= 300)) {
      error = new Error(body);
      error.code = response.statusCode;
      if (error.code === 401 || error.code === 403) {
        error.body = error.message;
        error.message = 'Unauthorized: Access is denied due to invalid credentials.';
      }
      body = null;
    }
    cb(error, body, response);
  };
}

/**
 * Creates the request.
 * 1. Merge default options with user provided options
 * 2. Checks for missing parameters
 * 3. Encode path and query parameters
 * 4. Call the api
 * @private
 * @return {ReadableStream|undefined}
 */
function createRequest(parameters, _callback) {
  var missingParams = null;
  var options = extend(true, {}, parameters.defaultOptions, parameters.options);
  var path = options.path;
  var body = options.body; // application/json or text/plain
  var form = options.form; // application/x-www-form-urlencoded
  var formData = options.formData; // application/x-www-form-urlencoded
  var qs = options.qs; // Query parameters

  // Provide a default callback if it doesn't exists
  var callback = typeof _callback === 'function' ? _callback /* no op */ : function () {};

  // Missing parameters
  if (parameters.options.requiredParams) {
    // eslint-disable-next-line no-console
    console.warn(new Error('requiredParams set on parameters.options - it should be set directly on parameters'));
  }

  missingParams = helper.getMissingParams(parameters.originalParams || extend({}, qs, body, form, formData, path), parameters.requiredParams);

  if (missingParams) {
    if (typeof _callback === 'function') {
      return callback(missingParams);
    } else {
      var errorStream = readableStream();
      setTimeout(function () {
        errorStream.emit('error', missingParams);
      }, 0);
      return errorStream;
    }
  }

  // Path params
  options.url = parsePath(options.url, path);
  delete options.path;

  // Headers
  options.headers = extend({}, options.headers);

  if (!isBrowser) {
    options.headers['User-Agent'] = pkg.name + '-nodejs-' + pkg.version;
  }

  // Query params
  if (options.qs && Object.keys(options.qs).length > 0) {
    options.useQuerystring = true;
  }

  // Add service default endpoint if options.url start with /
  if (options.url.charAt(0) === '/') {
    options.url = parameters.defaultOptions.url + options.url;
  }

  // Compression support
  options.gzip = true;
  console.log(options);
  return request(options, formatErrorIfExists(callback));
}

module.exports = createRequest;