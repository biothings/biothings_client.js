(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.biothings_client = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var axios = require('axios')
var Rx = require('@reactivex/rxjs');
var r = axios
var client_configs = require('./client_configs.json');
var extend = require('extend')
var client_extensions = require('./client_extension')

var isBrowser=new Function("try {return this===window;}catch(e){ return false;}");

if(!isBrowser)
{
  axios.defaults.headers['user-agent'] = "biothings_client Node.JS package"
}

var common_args = 
{
  query_endpoint: "/query/",
  metadata_endpoint: "/metadata",
  metadata_fields_endpoint: "/metadata/fields",
  top_level_jsonld_uris: [],
  delay: 1000,
  step: 1000,
  scroll_size: 1000,
  max_query: 1000
}


/**
 * Returns a client for the given type
 * @param {string} client_type - The type of client to user (eg: gene, variant).
 * @param {string} options - Additional options to supply to the client.
 * @returns {biothings_client} An instance of the client for the requested type.
 */
var biothings_client = (client_type, options) => {
  var options = options || {}

  var client_type = client_type.toLowerCase()

  if(!client_configs[client_type] && !options.url) return null; //No matching client

  var client_settings = {}
  extend(client_settings, common_args, client_configs[client_type])
  client_settings.default_step = client_settings.step

  //Create a new 'this' for the client
  return api_client.call({}, client_type, client_settings)
}
/**
 * Biothings Client.
 * Used to query biothings APIs
 * @module biothings_client
 */
module.exports = biothings_client

function assemble_hits(result) {
  var results = []
  result.forEach(i => results = results.concat(i.hits))
  return results
}
function assemble_arrays(result) {
  var final = []
  result.forEach(i => final = final.concat(i))
  return final
}

/**
 * @constructor
 */
function api_client(type, options) {

  var that = this

  var query_delay = (ms) => {
    return function(x) {
      return new Promise(resolve => setTimeout(() => resolve(x), ms));
    };
  }

  var chunk_function = (entries, query_function, response_handler) => {
    var result = Promise.resolve()

    var final_results = []

    for(var chunk = 0; chunk < entries.length; chunk += options.step) {
      (() => { //Creates a new closure, so chunk_items is unique per iteration
        var chunk_items = entries.slice(chunk, chunk + options.step)
        if(chunk != 0) result = result.then(query_delay(options.delay))
        result = result
        .then(() => {
          return query_function(chunk_items)
        })
        .then((response) => {
          final_results = final_results.concat(response_handler(response))
        });
      })();
    }

    return result.then(() => {return final_results});
  };

  var query_fetch_all = (final_url, args, request_fn) => {
    var query_iterator;
    var result_observable;
    var query_iterator_fn = function *() {
      var results = yield request_fn(final_url, args, false)
      var scroll_id = results._scroll_id
      var total_results = results.total
      var scroll_args = {}
      extend(scroll_args, args, {scroll_id: scroll_id})

      for(var chunk = options.step; chunk < total_results; chunk += options.step)
      {
        results = yield request_fn(final_url, scroll_args, false)
      }
    }

    query_iterator = query_iterator_fn()
    var first_query = query_iterator.next()

    return new Rx.Observable(observer => {
      var step_results = (results) => {
        //Check to make sure we got iterable results
        if(typeof results.hits[Symbol.iterator] === 'function')
        {
          for(var hit of results.hits)
          {
            observer.next(hit) //Give data up to subscriber 
          }
        }
        else
        {
          //otherwise, its empty, and we are done
          observer.complete()
          return
        }
        var next_prom = query_iterator.next(results)
        if(!next_prom.done) {
          next_prom.value.then(step_results)
        } else {
          observer.complete()
        }
      }
      //Start it
      first_query.value.then(step_results)
    });
  }

  var query_inner = (querystring, args, method) => {
    method = method || "GET"
    var final_args = {q: querystring}
    extend(final_args, args)
    var final_url = options.url + options.query_endpoint

    if(final_args.fields instanceof Array){
      final_args.fields = final_args.fields.join(",")
    }

    var request_fn = method == "GET" ? request_get : request_post

    if(final_args.fetch_all){
      return query_fetch_all(final_url, final_args, request_fn)
    }
    else {
      return request_fn(final_url, final_args, false)
    }
  }

  var request_get = (url, params, null_404) => {
    params = params || {}
    null_404 = null_404 || false

    var args = {
      url: url,
      method: 'get',
      params: params
    }

    if(null_404) {
      args.validateStatus = (status) => {
        return (status >= 200 && status < 300) || (status == 404)
      }
    }

    return r.request(args)
      .then((result) => {
        if(null_404 && result.status == 404) {
          return null
        } else {
          return result.data;
        }
      })
  }

  var request_post = (url, params) => {
    params = params || {}

    var args = {
      url: url,
      method: 'post',
      params: params,
      headers: {
        'content-type': 'application/x-www-form-urlencoded'
      }
    }

    return r.request(args)
    .then((result) => {
      return result.data;
    })
  }

  /**
   * Returns the current page step
   * @returns {number} 
   */
  this.get_step = function() {
    return options.step;
  }

  /**
   * Sets the page step
   * @param {number} step - How many 
   * @returns {number} 
   */
  this.set_step = function(step) {
    options.step = step;
  }

  /**
   * Reset the page step to the default value
   */
  this.reset_step = function() {
    step = options.default_step
  }

  /**
   * Return a dictionary of Biothing metadata.
   * @param {Object} params - additional get params
   * @returns {Promise<Object>} the metadata for the specific client
   */
  this.get_metadata = function(params) {
    params = params || {}
    var final_url = options.url + options.metadata_endpoint
    return request_get(final_url, params, false)
  }

  /**
   * This is a wrapper for GET query of the biothings annotation service.
   * <p>Note: This function is also mapped to the name of the client, eg: gene client has the function getgene()</p
   * @param {number} id - entity id.
   * @param {string|string[]} fields - the fields to return. If not provided or "all", all available fields
                       are returned.
   * @param {Object} params - additional get params
   * @return {Promise<Object[]>} a promise that will return your results
   */
  this.get_annotation = function(id, fields, params) {
    params = params || {}
    
    if(fields instanceof Array){
      fields = fields.join(",")
    }
    var final_url = options.url + options.annotation_endpoint + id
    if(fields) {
      params.fields = fields
    }
    return request_get(final_url, params, true)
  }

  /**
   * Return the list of annotation objects for the given list of ids.
   *
   * This is a wrapper for POST query of the biothings annotation service.
   * <p>Hint: A large list of more than 1000(default) input ids will be sent to the backend
   *          web service in batches (1000 at a time), and then the results will be
   *          concatenated together. So, from the user-end, it's exactly the same as
   *          passing a shorter list. You don't need to worry about saturating our
   *          backend servers.</p>
   * <p>Note: This function is also mapped to the name of the client + s, eg: gene client has the function getgenes()</p
   * @param {string|string[]} ids - a list/tuple/iterable or a string of ids.
   * @param {Object} params - additional post params
   * @return {Promise<Object[]>} a promise that will return your results
   *
   */
  this.get_annotations = function(ids, params) {
    params = params || {}

    var id_list = ids

    if(typeof(id_list) == "string") {
      id_list = id_list.split(",")
    }

    var final_url = options.url + options.annotation_endpoint
    if(id_list.length < options.step) {
      params.ids = id_list.join(",")
      return request_post(final_url, {ids: id_list.join(",")})
    } else {
      return chunk_function(id_list, 
        (id_chunk) =>  {
          params.ids = id_chunk.join(",")
          return request_post(final_url, params)
        },
        (response) => {
          return response
        });
    }

  }

  /**
   * Wrapper for /metadata/fields
   * <p>Hint: This is useful to find out the field names you need to pass to the fields parameter of other methods.</p>
   * @param {string} search - search term is a case insensitive string to search for in available field names.
   *        If not provided, all available fields will be returned.
   * @params {Object} params - additional get params
   * @return {Promise<Object[]>} a promise that will return your results
   */
  this.get_fields = function(search, params) {
    params = params || {}
    var final_url = options.url + options.metadata_fields_endpoint
    if(search) {
      params.search = search
    }

    return request_get(final_url, params)
  }

  /**
   * This is a wrapper for GET query of biothings query service.
   * <p>Note about params. You can supply {fetch_all: true}, to return an Observable that will stream
   *    results back via a callback.
   * <p>Hint: By default, the query method returns the first 10 if there are more than 10 hits.
   *          If the total number of hits are less than 1000, you can increase the value for
   *          the {size} param. For a query that returns more than 1000 hits, you can pass
   *          {fetch_all:true} param to return a {@link http://reactivex.io/rxjs/class/es6/Observable.js~Observable.html|Rx.Observable}
   *          that streams back results (internally, those hits are requested from the server in blocks of 1000(default)).</p>
   * @param querystring - run a query against the service, and return all the results.
   * @param params - additions get params
   * @return {Promise<Object>|Rx.Observable<Object>} the results of the query
   */
  this.query = function(querystring, params, method) {
    return query_inner(querystring, params, "GET")
  }

  /**
   * This is a wrapper for POST query of "/query" service.
   * Hint: Passing a large list of ids (>1000) is perfectly fine, it will be chunked up.
   * @param {string|string[]} queryterms - a list query terms, or a string of comma-separated query terms.
   * @return {Promise<Object[]>} a list of matching objects or a pandas DataFrame object.
   */
  this.query_many = function(queryterms, args) {
    var final_querytems
    if(typeof(queryterms) == "string"){
      queryterms = queryterms.split(",")
    }

    return chunk_function(queryterms,
    (terms) => {
      return query_inner(terms.join(","), args, "POST")
    },
    (response) => {
      return response
    });
  }

  //Attach friendly names. eg: getgene, getgenes
  this["get" + type] = this.get_annotation
  this["get" + type + "s"] = this.get_annotations

  //Apply any extensions to the client from the client_extensions.js file
  if(client_extensions[type]) {
    extend(this, client_extensions[type](this))
  }

  return this;
}

},{"./client_configs.json":2,"./client_extension":3,"@reactivex/rxjs":"@reactivex/rxjs","axios":"axios","extend":"extend"}],2:[function(require,module,exports){
module.exports={
  "gene":
  {
    "url": "http://mygene.info/v3",
    "pkg_user_agent_header": "MyGene.py",
    "annotation_endpoint": "/gene/",
    "optionally_plural_object_type": "gene(s)",
    "default_cache_file": "mygene_cache",
    "entity": "gene"
  },
  "variant":
  {
    "url": "http://myvariant.info/v1",
    "pkg_user_agent_header": "MyVariant.py",
    "annotation_endpoint": "/variant/",
    "optionally_plural_object_type": "variant(s)",
    "default_cache_file": "myvariant_cache",
    "entity": "variant",
    "top_level_jsonld_uris":
    [
      "http://schema.myvariant.info/datasource/cadd",
      "http://schema.myvariant.info/datasource/clinvar",
      "http://schema.myvariant.info/datasource/dbnsfp",
      "http://schema.myvariant.info/datasource/dbsnp",
      "http://schema.myvariant.info/datasource/docm",
      "http://schema.myvariant.info/datasource/emv",
      "http://schema.myvariant.info/datasource/evs",
      "http://schema.myvariant.info/datasource/gwassnps",
      "http://schema.myvariant.info/datasource/mutdb",
      "http://schema.myvariant.info/datasource/snpeff"
    ]
  },
  "chem":
  {
    "url": "http://mychem.info/v1",
    "pkg_user_agent_header": "MyChem.py",
    "annotation_endpoint": "/chem/",
    "optionally_plural_object_type": "chem(s)",
    "entity": "chem",
    "default_cache_file": "mychem_cache",
    "step": 10,
    "max_query": 10
  },
  "taxon":
  {
    "url": "http://t.biothings.io/v1",
    "pkg_user_agent_header": "MyTaxon.py",
    "annotation_endpoint": "/taxon/",
    "optionally_plural_object_type": "taxon/taxa",
    "entity": "taxon",
    "default_cache_file": "mytaxon_cache"
  }
}
},{}],3:[function(require,module,exports){
module.exports = {
  variant: (instance) => {
    return {
      normalize_vcf: (chrom, pos, ref, alt) => 
      {   
        var _ref, _alt;
        var i;

        for(i = 0; i < Math.max(ref.length, alt.length); i++) {
          _ref = (i < ref.length) ? ref[i] : null
          _alt = (i < alt.length) ? alt[i] : null
          if(!_ref || !_alt || _ref != _alt)
            break
        }

        // _ref/_alt cannot be both None, if so,
        // ref and alt are exactly the same,
        // something is wrong with this VCF record
        if(!_ref && !_alt) {
          throw "Invalid ref/alt inputs"
        }

        var _pos = parseInt(pos)
        if(!_ref || !_alt) {
          // if either is None, del or ins types
          _pos = _pos + i - 1
          _ref = ref.substr(i-1)
          _alt = alt.substr(i-1)
        }
        else {
          // both _ref/_alt are not None
          _pos = _pos + i
          _ref = ref.substr(i)
          _alt = alt.substr(i)
        }

        return [chrom, _pos, _ref, _alt]
      },
      format_hgvs: (chrom, pos, ref, alt) =>
      {
        if(chrom.toLowerCase().startsWith(`chr`)) {
          chrom = chrom.substr(3)
        }

        if(ref.length == alt.length == 1) {
          // this is a SNP
          return `chr${chrom}:g.${pos}${ref}>${alt}`
        }
        else if(ref.length > 1 && alt.length == 1) {
          // this is a deletion:
          if (ref[0] == alt){
            var start = parseInt(pos) + 1
            var end = parseInt(pos) + ref.length - 1
            if(start == end) {
              return `chr${chrom}:g.${start}del`
            }
            else {
              return `chr${chrom}:g.${start}_${end}del`
            }
          }
          else {
            var end = parseInt(pos) + ref.length - 1
            return `chr${chrom}:g.${pos}_${end}delins${alt}`
          }
        }
        else if(ref.length == 1 && alt.length > 1) {
          // this is an insertion
          if(alt[0] == ref) {
            return `chr${chrom}:g.${pos}_${parseInt(pos) + 1}ins${alt.substr(1)}`
          }
          else {
            return `chr${chrom}:g.${pos}delins${alt}`
          }
        }
        else if(ref.length > 1 && alt.length > 1) {
          if(ref[0] == alt[0]) {
            // if ref and alt overlap from the left, trim them first
            var [_chrom, _pos, _ref, _alt] = instance.normalize_vcf(chrom, pos, ref, alt)
            return instance.format_hgvs(_chrom, _pos, _ref, _alt)
          }
          else {
            var end = parseInt(pos) + alt.length - 1
            return `chr${chrom}:g.${pos}_${end}delins${alt}`
          }
        }
        else {
          throw `Cannot convert ` + JSON.stringify({chrom: chrom, pos: pos, ref:ref, alt:alt}) + ` into HGVS id.`
        }
        return hgvs        
      }
    }
  }
}
},{}]},{},[1])(1)
});