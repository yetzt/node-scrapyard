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

function scrapyard(config){
	if (!(this instanceof scrapyard)) return new scrapyard(config);
	
	var self = this;
	
	// check config
	if (!config) var config = {};
	self.config = {};

	// number of tries
	self.config.retry = (config.hasOwnProperty('retry') && !isNaN(parseInt(config.retry,10))) ? parseInt(config.retry,10) : 5;
	
	// number of connections
	self.config.connections = (config.hasOwnProperty('connections') && !isNaN(parseInt(config.connections,10))) ? parseInt(config.connections,10) : 5;

	// support ancient timeout config #legacy
	if (config.hasOwnProperty("timeout") && !config.hasOwnProperty("bestbefore")) config.bestbefore = config.timeout;

	// best before
	self.config.bestbefore = 0; 	
	if (config.hasOwnProperty("bestbefore")) switch (typeof config.bestbefore) {
		case "string": self.config.bestbefore = dur(config.bestbefore); break;
		case "number": self.config.bestbefore = parseInt(config.bestbefore,10); break;
	}

	// cache
	self.config.cache = (config.hasOwnProperty("cache") && (typeof config.cache) === 'string' && config.cache !== "") ? path.resolve(config.cache) : false;
	self.storage = (self.config.cache) ? new garage(self.config.cache) : false;

	// async queue witha concurrent conenctions
	self.queue = async.queue(function(fn, next){ fn(next); },self.config.connections);

	// fun with function objects, maintain old interface #legacy
	var bloogie = function(options, fn){ return self.scrape(options, fn); };
	bloogie.scrape = function(options, fn){ return self.scrape(options, fn); };
	return bloogie;
	
};

// legacy param code
scrapyard.prototype.scrape_opts = function(arx){
	var self = this;

	// defaults
	var opts = {
		url: arx[0],
		type: "html",
		method: "GET",
		encoding: "binary"
	};
	
	// walk through arguments
	for (var i=0; i<arx.length; i++) {
		switch (typeof arx[i]) {
			case "function": 
				fn = arx[i]; 
			break;
			case "string": 
				switch (arx[i].toLowerCase()) {
					case "html": opts.type = "html"; break;
					case "xml": opts.type = "xml"; break;
					case "json": opts.type = "json"; break;
					case "raw": opts.type = "raw"; break;
					case "get": opts.method = "GET"; break;
					case "post": opts.method = "POST"; break;
					case "binary": opts.encoding = "binary"; break;
					case "utf8": opts.encoding = "utf8"; break;
					default: if (i > 0) debug("[warn] unrecognized argument: %s", arx[i]); break;
				}
			break;
			case "object": 
				opts.form = arx[i];
			break;
		};
	};

	return opts;
};

// scrape
scrapyard.prototype.scrape = function(options, fn) {
	var self = this;

	// backwards compatibility
	if (typeof options !== 'object') var options = self.scrape_opts(arguments);

	// default type html
	if (!options.hasOwnProperty('type') && ["html","xml","json","raw"].indexOf(options.type) < 0) options.type = 'html';

	// iterator
	options.it = (typeof options.it === 'undefined') ? 1 : (options.it+1);

	// check if too many iterations have passed
	if (options.it > self.config.retry) return debug('[gvup] %s', options.url) || fn(new Error('scrape failed after maximum number of retries'));

	// queue fetch request
	self.queue.push(function(done){
		self.fetch(options, function(err, data){
			done();
			if (!err) return fn(null, data);
			if (err.hasOwnProperty('code') && ["ECONNREFUSED","ENOTFOUND"].indexOf(err.code) >= 0) return debug("[err!] irrecoverable error %s - %s", err.code, options.url) || fn(err);
			debug('[retr] %s', options.url);

			// check iterator for maximum retries
			if (options.it === self.config.retry) return debug('[gvup] %s', options.url) || fn(new Error('scrape failed after maximum number of retries'));

			// wait for 100ms and try again
			setTimeout(function(){
				self.scrape(options, fn);
			},100);
		});
	});
};

scrapyard.prototype.scrape.prototype.scrape = scrapyard.prototype.scrape;

// parse
scrapyard.prototype.parse = function(options, data, fn){
	var self = this;
	switch (options.type) {
		case "html": 
			// create cheerio object from html result
			try { data = cheerio.load(data); } catch(err) { return fn(err); };
			fn(null, data);
		break;
		case "json": 
			// parse a json result
			try { data = JSON.parse(data); } catch(err) { return fn(err); };
			fn(null, data);
		break;
		case "xml": 
			// parse an xml result
			new xml2js.Parser().parseString(data.toString(), fn); 
		break;
		default: 
			fn(null, data); 
		break;
	}
	return this;
};

// fetch an url with request or get it from storage
scrapyard.prototype.fetch = function(options, fn) {
	var self = this;
	if (self.storage) {
		options.storageid = options.url+((options.hasOwnProperty("form"))?JSON.stringify(options.form):"");
		self.storage.valid(options.storageid, self.config.bestbefore, function(valid){
			if (valid) {
				// try to retrieve from storage
				self.storage.get(options.storageid, function(err, data){
					if (err) {
						// get and save
						request(options, function(err, response, data){
							if (err) return debug('[err!] %s - %s', err, options.url) || fn(err);
							if (response.statusCode !== 200) return debug('[err!] Response Status Code %d - %s', response.statusCode, options.url) || fn(new Error("Response Status Code "+response.statusCode));
							self.parse(options, data, fn);
							self.storage.put(options.storageid, data, function(){
								debug('[save] %s', options.url);
							});
						});
					} else {
						// call back
						self.parse(options, data.toString('utf8'), fn);
					}
				});
			} else {
				// get a new one
				request(options, function(err, response, data){
					if (err) return debug('[err!] %s - %s', err, options.url) || fn(err);
					if (response.statusCode !== 200) return debug('[err!] Response Status Code %d - %s', response.statusCode, options.url) || fn(new Error("Response Status Code "+response.statusCode));
					self.parse(options, data, fn);
					self.storage.put(options.storageid, data, function(){
						debug('[save] %s', options.url);
					});
				});
			}
		});
	} else {
		// get one
		request(options, function(err, response, data){
			if (err) return debug('[err!] %s - %s', err, options.url) || fn(err);
			if (response.statusCode !== 200) return debug('[err!] Response Status Code %d - %s', response.statusCode, options.url) || fn(new Error("Response Status Code "+response.statusCode));
			self.parse(options, data, fn);
		});
	}
};

module.exports = scrapyard;

