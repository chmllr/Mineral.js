"use strict";

function isList(x) {
    return x instanceof Array;
}

function isNIL(x) {
    return isList(x) && x.length == 0;
}

function isString(x) {
    return typeof x == "string";
}

function isMineralString(x) {
    return isString(x) && x.match(/^"([^"]|\\")*"$/);
}

function fixName(name) {
    if(name.indexOf("-") >= 0) return name.replace(/-/g, "_");
    else if(name.indexOf("_") >= 0) return name.replace(/_/g, "-");
    return name;
}

function isFunction(f) {
    return typeof f == "function";
}

var sugarMap = { "'" : "quote", "`": "backquote", "~": "unquote"};

var enclosureMap = { '(' : ')', '"' : '"' };

var mineral = {

    "quote": function(x) {
        return x;
    },

    "atom":  function(x) {
        return !isList(x) || isNIL(x);
    },

    "eq": function(a, b) {
        return a == b || (isNIL(a) && isNIL(b));
    },

    "head":  function(list) {
        if(!isList(list)) throw("The argument of 'head' is not a list!");
        return list[0];
    },

    "tail": function(list) {
        if(isNIL(list)) throw("Empty list has no tail!");
        if(!isList(list)) throw "The argument of 'tail' is not a list!";
        return list.slice(1,list.length);
    },

    "cons": function(element, list) {
        var result = list.slice(0);
        result.unshift(element);
        return result;
    },

    "if": function(guard, thenAction, elseAction, localEnv) {
        var value = evaluate(guard, localEnv);
        return evaluate(value != false && !isNIL(value) ? thenAction : elseAction, localEnv);
    },

    "lambda": function(bindings, exp) {
        var optionalArgsSep = bindings.indexOf("&"), optionalBinding;
        if(optionalArgsSep >= 0 && bindings.length > optionalArgsSep+1) {
            optionalBinding = bindings[optionalArgsSep+1];
            bindings = bindings.slice(0,optionalArgsSep);
        }
        return function() {
            var args = Array.prototype.slice.call(arguments);
            var localEnv = {};
            for (var i in bindings) localEnv[bindings[i]] = args[i];
                if(optionalArgsSep >= 0)
                    localEnv[optionalBinding] = args.slice(bindings.length);
                return evaluate(exp, localEnv);
            }
        },

        "def": function(name, value) {
            var localEnv = {};
            name = fixName(name);
            localEnv[name] = function(x) { return mineral[name](x); };
            mineral[name] = evaluate(value, localEnv);
            return mineral[name];
        },

        "backquote": function(args, localEnv) {
            if(isNIL(args)) return [];
            if (isList(args)) {
            args = args.slice(0); // avoid destruction
            var token = args.shift();
            if(token == sugarMap["~"]) return evaluate(args[0], localEnv);
            var result = (isNIL(args) ? [] : mineral.backquote(args, localEnv))
            result.unshift(mineral.backquote(token, localEnv));
            return result;
        }
        return args;
    },

    "macro": function(bindings, exp) {
        var lambda = mineral.lambda(bindings, exp);
        lambda["macro"] = true;
        return lambda;
    },

    "externalcall": function() {
        var args = Array.prototype.slice.call(arguments);
        for(var i in args) args[i] = eval(args[i]);
            var object = args[0], method = args[1], args = args.slice(2);
        return JSON.stringify(object[method].apply(object, args));
    },

    "true": true,
    "false": false
}

function resolve(expression, localEnv) {
    if(!expression || isMineralString(expression)) return expression;
    var result;
    if(localEnv) {
        result = localEnv[fixName(expression)];
        if(result != undefined) return result;
    }
    return mineral[fixName(expression)];
}

function evaluate(value, localEnv) {
    if(isNIL(value)) return [];
    if (!isList(value)) return resolve(value, localEnv);
    else {
        var token = value[0], 
        localMethodCall = isString(token) && token.charAt(0) == ".",
        f = evaluate(token, localEnv), args;
        if(!f || localMethodCall) {
            var object = "window";
            if(localMethodCall) {
                object = evaluate(value[1], localEnv);
                object = object ? object : value[1];
            }
            args = [["quote", object], JSON.stringify(localMethodCall ? value[0].slice(1) : token)];
            args = args.concat(value.slice(localMethodCall ? 2 : 1));
            f = evaluate("externalcall", localEnv);
        } else args = value.slice(1)
        if(["quote", "backquote", "if", "lambda", "macro", "def"]
            .indexOf(token) < 0 && !f.macro)
            for(var i in args) args[i] = evaluate(args[i], localEnv);
                if(["if", "backquote"].indexOf(token) >= 0) args.push(localEnv);
        var result = f.apply(this, args);
        if(f.macro) return evaluate(result, localEnv);
        return result;
    }
}

function tokenize(code, memo, pos) {
    if(code.length <= pos) return memo;
    var current = code.charAt(pos), result = "", sugared = false, ops = [];
    if (current == " ") return tokenize(code, memo, pos+1);
    while(Object.keys(sugarMap).indexOf(current) >= 0) {
        ops.unshift(sugarMap[current]);
        current = code.charAt(++pos);
        sugared = true;
    }
    if(current == ")") throwSyntaxError(pos, code);
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
        result = opener == "(" 
            ? tokenize(code.substring(oldPos+1, pos), [], 0)
            : opener + code.substring(oldPos+1, pos) + closer;
    } else
        while(pos < code.length && code.charAt(pos) != " ") result += code.charAt(pos++);
    if(sugared)
        for(var i in ops)
    result = [ops[i], result];
    memo.push(result);
    return tokenize(code, memo, pos+1);
}

function throwSyntaxError(pos, code) {
    throw("Syntax error at position " + pos + ": " + code);
}

function parse(code) {
    return tokenize(code, [], 0)[0];
}

function stringify(code) {
    if(!isList(code)) return code + "";
    var output = "";
    for(var i in code) output += stringify(code[i]) + " ";
        return "(" + output.substring(0, output.length-1) + ")";
}

function normalize(code) {
    var patterns = [
        // TODO: delete until the line end and not certain whitespace!
        { "pattern": /;.*[\n\r]/g, "substitution": "" }, // comments
        { "pattern": /[\s\t\n\r]+/g, "substitution": " " }, // whitespace normalization
        { "pattern": /%(.*?)?\./g, "substitution": "lambda ($1)" } // lambda sugar
    ];
    for(var i in patterns)
        code = code.replace(patterns[i].pattern, patterns[i].substitution);
    return code.trim();
}

function interpret(input) {
    return stringify(evaluate(parse(normalize(input))));
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
            content += normalize(httpRequest.responseText);
            if(args.length == fileNr)
                evaluate(parse(normalize("((lambda ()) " + content + ")")));
            else loadFile();
        }
    };
    httpRequest.onreadystatechange = processText;
    loadFile();
}
