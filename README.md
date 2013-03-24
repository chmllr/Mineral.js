# README

Mineral.js is a yet another Lisp in the browser started as an exercise after reading "The Roots of Lisp" paper by Paul Graham.

## Primitives

 - `quote`
 - `atom`
 - `eq?`
 - `head`
 - `tail`
 - `cons`
 - `if`
 - `lambda`
 - `def`
 - `apply`
 - `externalcall` (to invoke native JS world)
 - `backquote` (will be removed)

## Syntactic Sugar

 - lambda function: `(% arg1 arg2 ... argN . s-expression)`
 - commenting out a s-exp by prepending with `#_`: `#_ (map f list)`

## Differences with Lisp

 - `t` is `true`
 - `()` is `false`
 - `cond` is `if`: `(if guard then-action  else-action)`
 - `car` is `head`
 - `cdr` is `tail`
 - `label` is `def`
 - `eq` is `eq?`
 - unquoting with `~`

## Interoperability with JS

All references to JS objects and top level functions should be qualified with a `js/` prefix:

    (js/alert "hello world!")
    (.log js/console "hello world!")

Properties are accessed just as functions for a read:

    ; returns the value of 'someId' element
    (.value (.getElementById js/document "someId"))

and can be set by using them as functions with arguments:

    ; sets the value of 'someId' to "hey"
    (.value (.getElementById js/document "someId") "hey")

## File Loading

Mineral code can be written in `*.mrl` files which will be then loaded using `loadFiles()`.
Example:

    <body onload="loadFiles('mrl/mineral.mrl', 'mrl/tests.mrl')">
