"use strict";

var DEBUG = false;

function isList(x) {
    return x instanceof Array;
}

function isObject(x) {
    return typeof x == "object";
}

function isNumber(x) {
    return typeof x == "number";
}

function isBoolean(x) {
    return typeof x == "boolean";
}

function isString(x) {
    return typeof x == "string";
}

function isNIL(x) {
    return isList(x) && x.length == 0;
}

function isAtom(x) {
    return x instanceof Atom;
}

function isPrimitive(x) {
    return isNIL(x) || isAtom(x) || !isList(x) && !isObject(x);
}

function Atom (value) {
    this.value = value;
}

function isJSReference(x) {
    return isString(x) && x.indexOf("js/") == 0;
} 

var cache = { }, cacheBlackList = ["event"];

function cachedEval(object) {
    if(!isAtom(object)) return object;
    var key = object.value;
    var result = cache[key];
    if(result != undefined) return result;
    var result = eval(key);
    if(cacheBlackList.indexOf(key) == -1) cache[key] = result;
    return result;
}

function newEnv(oldObject) {
    var newObject = {};
    for(var key in oldObject) newObject[key] = oldObject[key];
    return newObject;
}

var atoms = { "quote" : new Atom("quote"), "backquote": new Atom("backquote"),
            "unquote": new Atom("unquote"), "js/window": new Atom("js/window"),
            "hashmap": new Atom("hashmap"), "fn": new Atom("fn"), 
            "unquote_splicing": new Atom("unquote_splicing"), "&": new Atom("&") };

var sugarMap = { "'" : atoms.quote, "`": atoms.backquote, 
                 "~": atoms.unquote, "@": atoms.unquote_splicing };

var enclosureMap = { '(' : ')', '"' : '"', "[": "]", "{": "}" };

var infixOperations = {
    "+": function(a, b) { return a + b },
    "-": function(a, b) { return a - b },
    "*": function(a, b) { return a * b },
    "/": function(a, b) { return a / b },
    "<": function(a, b) { return a < b },
    ">": function(a, b) { return a > b },
    ">=": function(a, b) { return a >= b },
    "<=": function(a, b) { return a <= b },
    "%": function(a, b) { return a % b },
    "^": function(a, b) { return a ^ b },
    "&": function(a, b) { return a & b },
    "|": function(a, b) { return a | b }
}

var mineral = {

    "quote": function(x) {
        return x;
    },

    "atom":  function(x) {
        return isPrimitive(x);
    },

    "eq": function(a, b) {
        return a == b || (isNIL(a) && isNIL(b)) || isAtom(a) && isAtom(b) && a.value == b.value;
    },

    "head":  function(list) {
        if(!isList(list)) 
            throw("Exception in 'head': " + list + " is not a list!");
        return list[0];
    },

    "tail": function(list) {
        if(isNIL(list) || !isList(list))
            throw "Exception in 'tail': can't work on " + list + "!";
        return list.slice(1);
    },

    "cons": function(element, list) {
        return [element].concat(list);
    },

    "if": function(guard, thenAction, elseAction) {
        var env = this.env;
        var value = evaluate(guard, this.env);
        return evaluate(!isNIL(value) && value ? thenAction : elseAction, env);
    },

    "fn": function() {
        var variants = {}, bindings, optionalArgsSep, optionalBinding;
        var arglists_exps = arguments.length > 2 || isList(arguments[0][0])
            ? arguments
            : [[arguments[0], arguments[1]]];
        for(var i in arglists_exps) {
            bindings = arglists_exps[i][0];
            optionalArgsSep = bindings.indexOf(atoms["&"]);
            if(optionalArgsSep >= 0 && bindings.length > optionalArgsSep+1) {
                optionalBinding = bindings[optionalArgsSep+1];
                bindings = bindings.slice(0,optionalArgsSep);
            }
            // TODO: deal with overriding
            variants[optionalBinding ? "any" : bindings.length] = 
                { "bindings": bindings,
                  "optionalBinding": optionalBinding,
                  "exp": arglists_exps[i][1]};
        }
        var lambda = function() {
            var env = newEnv(this.env), n = arguments.length,
                variant = variants[n in variants ? n : "any"];
            if(!variant) 
                throw "Wrong number of arguments: " + n + " instead of " + Object.keys(variants);
            bindings = variant.bindings;
            for (var i = 0; i < bindings.length; i++) env[bindings[i].value] = arguments[i];
            if(variant.optionalBinding) {
                var args = [];
                for (var i = bindings.length; i < arguments.length; i++)
                    args.push(arguments[i]);
                env[variant.optionalBinding.value] = args;
            }
            return evaluate(variant.exp, env);
        };
        lambda["lambda"] = true;
        return lambda;
    },

    "def": function(atom, value, locally) {
        var name = atom.value, scope = locally ? this.env : mineral;
        if(scope == undefined) throw("There is no local scope for '" + name + "'.");
        scope[name] = evaluate(value, this.env);
        if(!locally && name.indexOf("-") >= 0) scope[name.replace(/-/g, "_")] = scope[name] 
        return scope[name];
    },

    "apply": function(f, args){
        return f.apply(this, args);
    },

    "externalcall": function() {
        var args = Array.prototype.slice.call(arguments);
        var object = cachedEval(args[0]), field = args[1], args = args.slice(2);
        var callee = object[field];
        var result = typeof callee == "function"
                        ? callee.apply(object, args)
                        : (args.length > 0 ? object[field] = args[0] : callee);
        return result;
    },

    "infixcall": function(op, a, b){
        return infixOperations[op.value].call(null, a, b);
    },

    "hashmap": function() {
        var newMap = {};
        if(arguments)
            for(var i = 0; i < arguments.length; i++)
                mineral.assoc(newMap, arguments[i], arguments[++i]);
        return newMap;
    },

    "get": function(map, key) {
        key = isString(key) ? key : stringify(key);
        return map[key];
    },

    "assoc": function(map, key, value) {
        key = isString(key) || isNumber(key) ? key : stringify(key);
        map[key] = value;
        return map;
    },

    "dissoc": function(map, key) {
        key = isString(key) ? key : stringify(key);
        delete map[key];
        return map;
    },

    "trycatch": function(code, catch_fn) {
        try {
            return evaluate(code, this.env);
        } catch (error) {
            catch_fn = evaluate(catch_fn, this.env);
            return catch_fn.apply(this, [error]);
        }
    },

    "while": function() {
        var env = this.env, args = Array.prototype.slice.call(arguments),
            predicate = args[0], n = args.length, result;
        while((result = evaluate(predicate, env)) && !isNIL(result))
            for(var i = 1; i < n; i++) evaluate(args[i], env);
    },

    "true": true,
    "false": false
}

function resolve(id, env) {
    if(id == undefined 
        || isNumber(id)
        || isBoolean(id)
        || isString(id)
        || isJSReference(id.value)
        || isNIL(id)) return id;
    if(env && id.value in env) return env[id.value];
    if(id.value in mineral) return mineral[id.value];
    throw("The identifier '" + id.value + "' is unknown.");
}

function evaluate(value, env) {
    if(isNIL(value)) return [];
    if(isPrimitive(value)) return resolve(value, env);
    var func = value[0], token = func.value, args = value.slice(1), macro = false;
    if(token == "macro") {
        macro = true;
        token = "fn"
        func = new Atom(token);
    }
    var localMethodCall = token && token.charAt(0) == ".";
    if(localMethodCall || isJSReference(token)) {
        var object = localMethodCall ? evaluate(value[1], env) : atoms["js/window"];
        object = isJSReference(object.value) ? new Atom(object.value.slice(3)) : object;
        args = [[atoms.quote, object], [atoms.quote, localMethodCall ? token.slice(1) : token.slice(3)]];
        args = args.concat(value.slice(localMethodCall ? 2 : 1));
        token = "externalcall";
        func = new Atom(token);
    }
    var f = evaluate(func, env);
    if(token != "quote" && token != "if" && token != "fn" && 
        token != "def" && token != "trycatch" && token != "while" && !f.macro)
        for(var i = 0; i < args.length; i++) args[i] = evaluate(args[i], env);
    mineral.env = env;
    var result = f.apply(mineral, args);
    if(macro) result["macro"] = macro;
    return result;
}

function expand(code) {
    if(isPrimitive(code)) return code;
    var expanded_code = [];
    for(var i in code) {
        var inline = !isPrimitive(code[i]) && code[i][0].value == atoms.unquote_splicing.value;
        if(inline) code[i][0] = atoms.unquote;
        var result = expand(code[i]);
        if(inline) expanded_code = expanded_code.concat(result);
        else expanded_code.push(result);
    }
    code = expanded_code;
    if(isPrimitive(code[0]) && code[0].value in mineral && mineral[code[0].value].macro) {
        var result = evaluate(code)
        return code[0].value == "backquote" ? evaluate(result) : result;
    } else return code;
}

function parse(string) {
    function tokenize(code, memo, pos) {
        if(code.length <= pos) return memo;
        var current = code.charAt(pos), result = "", sugared = false, ops = [];
        if (isWhitespace(current)) return tokenize(code, memo, pos+1);
        while(Object.keys(sugarMap).indexOf(current) >= 0) {
            ops.unshift(sugarMap[current]);
            current = code.charAt(++pos);
            sugared = true;
        }
        if([")", "]", "}"].indexOf(current) >= 0) throwSyntaxError(pos, code);
        if(Object.keys(enclosureMap).indexOf(current) >= 0) {
            var enclosures = 1, oldPos = pos, opener = current, closer = enclosureMap[current];
            while(enclosures > 0) {
                pos++;
                if(enclosures < 0 || pos == code.length) throwSyntaxError(pos, code);
                current = code.charAt(pos);
                if(current == "\\") {
                    pos++;
                    continue;
                }
                else if(opener != closer && current == opener) enclosures++;
                else if(current == closer) enclosures--;
            }
            result = opener != '"'
                ? tokenize(code.substring(oldPos+1, pos), [], 0)
                : eval('"' + code.substring(oldPos+1, pos) + '"');
            if(opener == "{")
                result = [atoms.hashmap].concat(result);
        } else {
            while(pos < code.length && !isWhitespace(code.charAt(pos))) result += code.charAt(pos++);
            if(!isNaN(result)) result = result | 0;
            if(result == "true" || result == "false") result = result == "true";
            if(isString(result) && result != "#_") {
                var atom = atoms[result];
                if(atom) result = atom;
                else {
                    atoms[result] = new Atom(result);
                    result = atoms[result];
                }
            }
        }
        if(sugared)
            for(var i in ops)
                result = [ops[i], result];
        if(memo[memo.length-1] == "#_") memo.pop(); else memo.push(result);
        return tokenize(code, memo, pos+1);
    }

    function isWhitespace(char) {
        return [" ", ","].indexOf(char) >= 0;
    }


    function throwSyntaxError(pos, code) {
        throw("Syntax error at position " + pos + ": " + code);
    }

    return tokenize(string, [], 0)[0];
}

function stringify(code) {
    if(isAtom(code)) return code.value;
    if(isString(code)) return JSON.stringify(code);
    if(!isList(code))
        if(typeof code == "function")
            return code.META ? stringify(code.META.source) : code;
        else if(isObject(code)) {
            var output = "";        
            for(var key in code) output += stringify(key) + " " + stringify(code[key]) + ", ";
            return "{" + output.substring(0, output.length-2) + "}";
        }
        else return code + '';
    var output = "";
    for(var i in code) output += stringify(code[i]) + " ";
    return "(" + output.substring(0, output.length-1) + ")";
}

function normalize(string) {
    var patterns = [
        { "pattern": /;.*($|\n|\r)/g, "substitution": "" }, // comments
        { "pattern": /[\s\t\n\r]+/g, "substitution": " " }, // whitespace normalization
        { "pattern": /%([a-zA-Z\-\s]*?)?\./g, "substitution": "fn ($1)" } // lambda
    ];
    for(var i in patterns)
        string = string.replace(patterns[i].pattern, patterns[i].substitution);
    return string.trim();
}

function interpret(input) {
    return stringify(evaluate(expand(parse(normalize(input)))));
}

function loadFiles() {
    var httpRequest = new XMLHttpRequest(), content = "", args = arguments, fileNr = 0;
    var loadFile = function() {
        var fileName = args[fileNr++];
        console.log("Loading " + fileName + "...");
        httpRequest.onerror = function () { console.error("Couldn't load " + fileName); }
        httpRequest.open('GET', fileName);
        httpRequest.send();
    };
    var processText = function() {
        if (httpRequest.readyState === 4 && httpRequest.status === 200) {
            content += httpRequest.responseText;
            if(args.length == fileNr) {
                var exps = parse(normalize("(" + content + ")"));
                for(var i in exps) {
                    if (DEBUG) console.log(stringify(exps[i]));
                    evaluate(expand(exps[i]));
                }
            } else loadFile();
        }
    };
    httpRequest.onreadystatechange = processText;
    loadFile();
}