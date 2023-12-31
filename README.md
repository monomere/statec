# statec

> **Note:** This is very much WIP! If you have any suggestions,
> issues or bugfixes, please make an issue or a pull request!

> **Another note:** I've been using this "library" for some
> time now, but it was always written from scratch for every
> new project. I decidede to share how nice it is to use this
> with people, so here I am :]

This is a package for stateful things, I'm not exactly sure
how to describe it otherwise...

A state is something that holds a value and can be modified
(updated). Something (an effect) can happen when that state
is updated. That's it. This system is incredibly useful for
doing reactive vanilla JS stuff.

## Example

> **Note:** Some of these patterns are already in utility
> functions provided by this library. If you want to add
> any, feel free to make a pull request or an issue c:

```ts
const name = new BasicState("Who knows?");

const nameElement = document.querySelector("#name");
nameElement.textContent = name.get();
name.effect(value => {
  nameElement.textContent = value;
});

const inputElement = document.querySelector("#input");
inputElement.value = name.get();
inputElement.oninput = () => {
  name.update(inputElement.value);
};
```

## Docs

### `EffectFunc<NewV, OldV>`

This is the "effect" function. The `newValue` should be
the same as `state.get()` and the `oldValue` is the value
that was current before the update that caused this effect happened. I should word this better.

```ts
type EffectFunc<NewV, OldV = NewV> =
  (newValue: NewV, oldValue: OldV) => void;
```

#### Example

```ts
state.update(0);

// You can bind multiple effects to one state.

state.effect((newValue, oldValue) => {
  if (newValue !== oldValue) {
    console.log("ahh! the value changed!!");
  }
});

state.effect((newValue, oldValue) => {
  if (newValue === oldValue) {
    console.log("nothing changed :/");
  }
});

state.update(1); // ahh! the value changed!!
state.update(1); // nothing changed :/
```

### `IReadonlyState<V>`

A sort of window into a state. You can't update it, but
someone else can.

```ts
interface IReadonlyState<V> {
  /** Get the current value. */
  get(): V;
  /**
   * Add/bind an effect function.
   * Similar to `addEventListener`.
   **/
  effect(func: EffectFunc<V>): void;
}
```

#### Example

```ts
function bindToTextContent(el: HTMLElement, state: IReadonlyState<string>) {
  el.textContent = state.get();
  state.effect(value => {
    el.textContent = value;
  });
  // Note: these two statements can be merged into one:
  //       effectNow(state, value => {
  //         el.TextContent = value;
  //       });
}
```

### `IState<V, T>`

Any state that you can update. When updating it you pass a
transaction, which then gets used when updating.

```ts
interface IState<V, T = V> extends IReadonlyState<V> {
  /** Update the state with the transaction. */
  update(trans: T): void;
}
```

#### Example

```ts
function bindInputValue(el: HTMLInputElement, state: IState<string>) {
  state.effect(value => { el.value = value; });
  el.addEventListener("input", () => { state.update(el.value); });
  // Note: Won't cause an infinite loop because setting
  //       element.value manually doesn't fire events!
}

function bindInputValues(els: HTMLInputElement[], state: IState<string>) {
  // binds the value for *all* of the elements.
  for (const el of els) bindInputValue(el, state);
}
```

### `State<V, T>`

A concrete implementaion of the `IState<V, T>` interface.
You should probably use this. When creating it, you need to
pass in a function that actually converts the transaction to
a new value and returns it. *Make sure that this function
doesn't mutate the original value!*

```ts
interface State<V, T = V> implements IState<V> {
  constructor(
    /** the initial value */
    initial: V,
    /**
     * The function that converts a transaction.
     * Note: it can be async!
     **/
    handler: (trans: T, current: V) => V | Promise<V>
  );

  /**
   * Note: if the update handler is async, this will
   * not wait for it, use `asyncUpdate` for that instead.
   **/
  update(trans: T): void;

  /**
   * If the handler is async, await its completion.
   **/
  asyncUpdate(trans: T): Promise<void>;

  get(): V;
  effect(func: EffectFunc<V>): void;
}
```

#### Example

```ts
class MapState<K, V> extends State<Map<K, V>, [K, V]> {
  constructor() {
    super(new Map<K, V>(), ([key, value], current) => {
      const newMap = new Map(current);
      newMap.set(key, value);
      return newMap;
    });
  }
}
```

### `ConstState<T>`

The simplest state possible. You can't update it at all.

```ts
class ConstState<V> implements IReadonlyState<V> {
  constructor(value: V);

  /** Returns `value` passed in the constructor. */
  get(): V;

  /** No-op */
  effect(): void;
}
```

#### Example

```ts
async function getCurrentUser(): IReadonlyState<User> {
  if (env.DEV) {
    return new ConstState(new User(getExampleUserData()));
  } else {
    const response = await fetch("/api/current_user");
    return new User(await response.json());
  }
}
```

### `BasicState<T>`

Most useful state implementation. The transaction passed to
the `update` function becomes the new value.

```ts
class BasicState<V> extends State<V, V> {
  constructor(value: V);
}
```

#### Example

```ts
const selectedIndex = new BasicState(0);

selectedIndex.effect(index => {
  ws2.send(`index-changed:${index}`);
});

ws1.onmessage = ev => {
  if (ev.data === "increment") {
    selectedIndex.update(selectedIndex.get() + 1);
  } else if (ev.data === "decrement") {
    selectedIndex.update(selectedIndex.get() - 1);
  }
};
```

### `ArrayState<T>`

A state for storing arrays. It's not that useful - a WIP.

```ts
class ArrayState<E> extends State<
  E[],                         // the value
  { add: E; } | { remove: E; } // the transaction
> {
  constructor(initial: E[]);
}
```

#### Example

```ts
const items = new ArrayState<string>([]);
items.update({ add: "hello" });
console.log(items.get()); // ["hello"]
items.update({ add: "hi c:" });
console.log(items.get()); // ["hello", "hi c:"]
items.update({ remove: "hello" });
console.log(items.get()); // ["hi c:"]
```

### `effectNow(state, effect)`

The most useful utility provided, in my experience! It adds
the supplied `effect` function to the state and calls it
immediately with the old value of `undefined`. There are a lot
of cases where you need to bind a value of the state to some
property, and you have to first set it to `state.get()` and
then set it in an effect function. Code duplication!

```ts
function effectNow<V>(
  s: IReadonlyState<V>,
  effect: EffectFunc<V, V | undefined>
): void;
```

#### Example

This is the example from the top of the page, but using
this function. See how it reduces code duplication?

```ts
const name = new BasicState("Who knows?");

const nameElement = document.querySelector("#name");
effectNow(name, value => {
  nameElement.textContent = value;
});

const inputElement = document.querySelector("#input");
inputElement.value = name.get();
inputElement.oninput = () => {
  name.update(inputElement.value);
};
```

### `dependentState(state, getValue)`

This creates a state that (guess what) depends on another
state. The new state can be of a different type than the
original one, so that means that there needs to be a
conversion function passed in. The `getValue` function gets
called immediately with the current value of the original
state and also when the original state updates. The value
of the new dependent state gets replaced (see `BasicState`)

```ts
function dependentState<V, U>(
  state: IReadonlyState<V>,
  getValue: (
    newValue: V,
    oldOriginalValue: V | undefined,
    oldDependentValue: U | undefined
  ) => U
): IReadonlyState<U>;
```

#### Example

```ts
const original = new BasicState(42);
const dependent = dependentState(
  original,
  (newValue, oldOriginalValue, oldDependentValue) => {
    console.log(
      "new:", newValue,
      "old orig:", oldOriginalValue,
      "old dep:", oldDependentValue
    );
    return newValue + 5;
  }
); // new: 42  old orig: undefined  old dep: undefined

console.log(dependent.get()); // 47

original.update(69); // haha funny
                     // new: 69  old orig: 42  old dep: 47

console.log(dependent.get()); // 74

```

### `asyncDependentState(state, getValue)`

Same as `dependentState`, but with an async `getValue` function.
(it's `await`ed)

```ts
function asyncDependentState<V, U>(
  state: IReadonlyState<V>,
  getValue: (
    newValue: V,
    oldOriginalValue: V | undefined,
    oldDependentValue: U | undefined
  ) => Promise<U>
): IReadonlyState<U>;
```

#### Example

```ts
const original = new BasicState("what??");
const dependent = await dependentState(
  original,
  async (newValue, oldOriginalValue, oldDependentValue) => {
    const response = await fetch(`/api/new/${newValue}`);
    return await response.json();
  }
);
```

### `lazyState(state, delay)`

> **TODO:** This is copied from the TS docs, redo this!!

Create a state that depends on another state, but times the
updates of the former to be less frequent. So if two updates
of the original state happen in the span of `delay`ms, only
one update will happen on the dependent state.

**TODO:** Generate an update that happens once after multiple
original updates so that the depenent state doesn't show an
outdated value forever if no more original updates happen.

**TODO:** come up with a better name.

```ts
function lazyState<T>(
  state: IReadonlyState<T>,
  delay?: number /* = 500 */
): IReadonlyState<T>;
```

#### Example

```ts
const mousePos = new BasicState([0, 0]);

window.onmousemove = (ev) => {
  mousePos.update([ev.clientX, ev.clientY]);
};

const lazyMousePos = jazyState(mousePos, 650);
lazyMousePos.effect(pos => {
  ws.send(JSON.stringify(pos));
});

// if you trigger the mousemove event, updates
// to the websocket will be sent only every 650ms.
```

### `joinedState`

Create a state that depends on multiple states at once.
You can't update it (maybe I'll add this functionality,
but I haven't really needed it so far) The value this
state holds is an array of the states' values you passed.
Useful when you need to have an effect for multiple states at once.

```ts
function joinedState<S extends IReadonlyState<any>[]>(
  ...states: S
): IReadonlyState<StatelessArray<S>> // <-- utility type
```

#### Example

```ts
const aState = new BasicState("A");
const bState = new BasicState(3.14);
const cState = new BasicState({ what: "idk" });

const allStates = joinedState(aState, bState, cState);
// allStates: IReadonlyState<[string, number, { what: string }]>

allStates.effect(([a, b, c], olds) => {
  // a: string, b: number, c: { what: string }
  // olds: [string, number, { what: string }]
});

// all of these update `allStates`
aState.update("B");
bState.update(2.71);
cState.update({ what: "oh!" });
```

## License

MIT. Plain and simple.

## Other

There are some other utility functions for HTML and DOM
stuff that I don't include here. Maybe I will.

I am using npm instead of yarn temporarily.
