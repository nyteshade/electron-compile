'use babel';

import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import mkdirp from 'mkdirp';

export default class CompileCache {
  constructor() {
    this.stats = {
      hits: 0,
      misses: 0
    };
    
    this.cacheDir = null;
    this.jsCacheDir = null;
  }
    
  getCompilerInformation() {
    throw new Error("Implement this in a derived class");
  }
  
  compile(sourceCode, filePath, cachePath) {
    throw new Error("Implement this in a derived class");
  }
  
  shouldCompileFile(sourceCode) {
    return true;
  }
  
  ///
  /// shasum - Hash with an update() method.
  /// value - Must be a value that could be returned by JSON.parse().
  ///
  updateDigestForJsonValue(shasum, value) {
    // Implmentation is similar to that of pretty-printing a JSON object, except:
    // * Strings are not escaped.
    // * No effort is made to avoid trailing commas.
    // These shortcuts should not affect the correctness of this function.
    const type = typeof(value);
    
    if (type === 'string') {
      shasum.update('"', 'utf8');
      shasum.update(value, 'utf8');
      shasum.update('"', 'utf8');
      return;
    }
    
    if (type === 'boolean' || type === 'number') {
      shasum.update(value.toString(), 'utf8');
      return;
    }
    
    if (value === null) {
      shasum.update('null', 'utf8');
      return;
    }
    
    if (Array.isArray(value)) {
      shasum.update('[', 'utf8');
      for (let i=0; i < value.length; i++) {
        this.updateDigestForJsonValue(shasum, value[i]);
        shasum.update(',', 'utf8');
      }
      shasum.update(']', 'utf8');
      return;
    }
    
    // value must be an object: be sure to sort the keys.
    let keys = Object.keys(value);
    keys.sort();

    shasum.update('{', 'utf8');
    
    for (let i=0; i < keys.length; i++) {
      this.updateDigestForJsonValue(shasum, keys[i]);
      shasum.update(': ', 'utf8');
      this.updateDigestForJsonValue(shasum, value[keys[i]]);
      shasum.update(',', 'utf8');
    }
    
    shasum.update('}', 'utf8');
  }

  createDigestForCompilerInformation() {
    let sha1 = crypto.createHash('sha1');
    this.updateDigestForJsonValue(sha1, this.getCompilerInformation());
    return sha1.digest('hex');
  }
  
  getCachePath(sourceCode) {
    let digest = crypto.createHash('sha1').update(sourceCode, 'utf8').digest('hex');

    if (!this.jsCacheDir) {
      this.jsCacheDir = path.join(this.cacheDir, this.createDigestForCompilerInformation());
      mkdirp.sync(this.jsCacheDir);
    }

    return path.join(this.jsCacheDir, `${digest}.js`);
  }

  getCachedJavaScript(cachePath) {
    try {
      let ret = fs.readFileSync(cachePath, 'utf8');
      this.stats.hits++;
      
      return ret;
    } catch (e) {
      return null;
    }
  }
  
  // Function that obeys the contract of an entry in the require.extensions map.
  // Returns the transpiled version of the JavaScript code at filePath, which is
  // either generated on the fly or pulled from cache.
  loadFile(module, filePath, returnOnly=false) {
    const sourceCode = fs.readFileSync(filePath, 'utf8');
    
    if (!this.shouldCompileFile(sourceCode)) {
      if (returnOnly) return sourceCode;
      
      return module._compile(sourceCode, filePath);
    }
    
    let cachePath = this.getCachePath(sourceCode);
    let js = this.getCachedJavaScript(cachePath);
    
    if (!js) {
      js = this.compile(sourceCode, filePath);
      this.stats.misses++;
      
      fs.writeFileSync(cachePath, js);
    } 
    
    if (returnOnly) return js;
    
    return module._compile(js, filePath);
  }
  
  register() {
    let info = this.getCompilerInformation();
    
    let extensions = (info.extensions ? info.extensions : [info.extension]);
    
    for (let i=0; i < extensions.length; i++) {
      Object.defineProperty(require.extensions, `.${extensions[i]}`, {
        enumerable: true,
        writable: false,
        value: (module, filePath) => this.loadFile(module, filePath)
      });
    }
   }
  
  setCacheDirectory(newCacheDir) {
    if (this.cacheDir === newCacheDir) return;
    
    this.cacheDir = newCacheDir;
    this.jsCacheDir = null;
  }
}
