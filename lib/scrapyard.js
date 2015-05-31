#!/usr/bin/env node

// require node modules
var path = require("path");

// require npm modules
var request = require("request");
var cheerio = require("cheerio");
var garage = require("garage");
var xml2js = require("xml2js");
var debug = require("debug")("scrapyard");
var async = require("async");
var dur = require("dur");

var scrapyard = function(config) {

	var s = this;
	s.config = config;
	
	// ensure config is an object
	if (typeof s.config !== "object") s.config = {};

	// number of tries
	if (!s.config.hasOwnProperty('retry') || isNaN(parseInt(s.config.retry,10))) s.config.retry = 5;
	s.config.retry = parseInt(s.config.retry, 10);

	// number of connections
	if (!s.config.hasOwnProperty('connections') || isNaN(parseInt(s.config.connections,10))) s.config.connections = 5;
	s.config.connections = parseInt(s.config.connections, 10);

	// debug flag
	if (s.config.hasOwnProperty('debug') && s.config.debug === true) debug.enable("scrapyard");
	
	// determine cache path and initialize storage if cache is activated
	if (!s.config.hasOwnProperty('cache') || (typeof s.config.cache !== 'string') || s.config.cache === "") {
		s.config.bestbefore = 0;
		s.config.cache = false;
		s.storage = false;
	} else {

		// best before
		if (s.config.hasOwnProperty('timeout') && !s.config.hasOwnProperty('bestbefore')) s.config.bestbefore = s.config.timeout;
		if (!s.config.hasOwnProperty('bestbefore')) s.config.bestbefore = 0;
		if (typeof s.config.bestbefore === "string") s.config.bestbefore = dur(s.config.bestbefore);
		if (isNaN(parseInt(s.config.bestbefore, 10))) s.config.bestbefore = 0;
		s.config.bestbefore = parseInt(s.config.bestbefore, 10);

		// activate cache
		s.config.cache = path.resolve(s.config.cache);
		s.storage = new garage(s.config.cache);
	}

	// async queue with concurrent conenctions
	s.queue = async.queue(function(task, callback){
		debug('[next] %s', task.url);
		s.perform(task, function(err,data){
			debug('[done] %s', task.url);
			callback(err, data);
		});
	},s.config.connections);
	
	// try several times to get an url
	s.scrape = function(options, callback) {

		// backwards compatibility
		if (typeof options !== 'object') {
			
			// defaults
			var opts = {
				url: arguments[0],
				type: "html",
				method: "GET",
				encoding: "binary"
			};
			
			// walk through arguments
			for (var i=0; i<arguments.length; i++) {
				switch (typeof arguments[i]) {
					case "function": 
						callback = arguments[i]; 
					break;
					case "string": 
						switch (arguments[i].toLowerCase()) {
							case "html": opts.type = "html"; break;
							case "xml": opts.type = "xml"; break;
							case "json": opts.type = "json"; break;
							case "get": opts.method = "GET"; break;
							case "post": opts.method = "POST"; break;
							case "binary": opts.encoding = "binary"; break;
							case "utf8": opts.encoding = "utf8"; break;
							default: if (i > 0) debug("[warn] unrecognized argument: %s", arguments[i]); break;
						}
					break;
					case "object": 
						opts.form = arguments[i];
					break;
				}
			}

			var options = opts;

		}

		// default type html
		if (!options.hasOwnProperty('type') && ["html","xml","json"].indexOf(options.type) < 0) options.type = 'html';

		options.it = (typeof options.it === 'undefined') ? 1 : (options.it+1);
		if (options.it > s.config.retry) {
			debug('[gvup] %s', options.url);
			callback(new Error('scrape failed after maximum number of retries'));
		} else {
			s.get(options, function(err, data){
				if (!err) return callback(null, data);
				if (err.hasOwnProperty('code') && err.code === 'ENOTFOUND') return debug("[err!] irrecoverable error %s - %s", err.code, options.url) || callback(err);
				debug('[retr] %s', options.url);
				// wait for 100ms and try again
				setTimeout(function(){
					s.scrape(options, callback);
				},100);
			});
		}
	};
	
	// try once to get an url
	s.get = function(options, callback) {
		s.queue.push(options, function(err, data){
			callback(err, data);
		});
	};

	// perform
	s.perform = function(options, callback) {
		switch (options.type) {
			case 'xml': s.xml(options, callback); break;
			case 'json': s.json(options, callback); break;
			case 'html': s.html(options, callback); break;
			default: callback(new Error('invalid type '+options.type));
		}
	};
	
	// get an xml resource
	s.xml = function(options, callback) {
		s.fetch(options, function(err, data){
			if (err) return callback(err);
			new xml2js.Parser().parseString(data.toString(), function(err, data){
				if (err) return callback(err);
				callback(null, data);
			});
		});
	};

	// get a json resource
	s.json = function(options, callback) {
		s.fetch(options, function(err,data){
			if (err) return callback(err);
			callback(null, JSON.parse(data));
		});
	};

	// get an html resource
	s.html = function(options, callback) {
		s.fetch(options, function(err,data){
			if (err) return callback(err);
			callback(null, cheerio.load(data));
		});
	};

	// fetch an url with request or get it from storage
	s.fetch = function(options, callback) {
		if (s.storage) {
			options.storageid = options.url+((options.hasOwnProperty("form"))?JSON.stringify(options.form):"");
			s.storage.valid(options.storageid, s.config.bestbefore, function(valid){
				if (valid) {
					// try to retrieve from storage
					s.storage.get(options.storageid, function(err, data){
						if (err) {
							// get and save
							request(options, function(err, response, data){
								if (err) return debug('[err!] %s - %s', err, options.url) || callback(err);
								if (response.statusCode !== 200) return debug('[err!] Response Status Code %d - %s', response.statusCode, options.url) || callback(new Error("Response Status Code "+response.statusCode));
								callback(null, data);
								s.storage.put(options.storageid, data, function(){
									debug('[save] %s', options.url);
								});
							});
						} else {
							// call back
							callback(null, data.toString('utf8'));
						}
					});
				} else {
					// get a new one
					request(options, function(err, response, data){
						if (err) return debug('[err!] %s - %s', err, options.url) || callback(err);
						if (response.statusCode !== 200) return debug('[err!] Response Status Code %d - %s', response.statusCode, options.url) || callback(new Error("Response Status Code "+response.statusCode));
						callback(null, data);
						s.storage.put(options.storageid, data, function(){
							debug('[save] %s', options.url);
						});
					});
				}
			});
		} else {
			request(options, function(err, response, data){
				if (err) return debug('[err!] %s - %s', err, options.url) || callback(err);
				if (response.statusCode !== 200) return debug('[err!] Response Status Code %d - %s', response.statusCode, options.url) || callback(new Error("Response Status Code "+response.statusCode));
				callback(null, data);
			});
		}
	};
	
	return s;
	
};

module.exports = scrapyard;

