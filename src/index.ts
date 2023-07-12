export type EffectFunc<V, O = V> = (value: V, old: O) => void;

/** A readonly "window" into a state. May be updated elsewhere. */
export interface IReadonlyState<V> {
	get(): V;
	effect(func: EffectFunc<V>): void;
}

/** A state. Can be updated. */
export interface IState<V, T = V> extends IReadonlyState<V> {
	update(trans: T): void;
}

/** The default state implementation. */
export class State<V, T> implements IState<V, T> {
	private value: V;
	private effects: EffectFunc<V>[];

	constructor(
		initial: V,
		private handler: (trans: T, current: V) => V | Promise<V>,
	) {
		this.value = initial;
		this.effects = [];
	}

	/**
	 * Note: if the update handler is async, this will not wait for it.
	 * Use {@link asyncUpdate} instead.
	 **/
	update(trans: T): void {
		this.asyncUpdate(trans);
	}

	/** If the function is not async, nothing is awaited. */
	async asyncUpdate(trans: T): Promise<void> {
		const old = this.value;
		const value = this.handler(trans, old);

		if (value instanceof Promise) this.value = await value;
		else this.value = value;

		this.effects.forEach((e) => e(this.value, old));
	}

	/** Get the current value. */
	get(): V {
		return this.value;
	}

	/** Add an effect handler. */
	effect(func: EffectFunc<V>): void {
		this.effects.push(func);
	}
}

/** Simplest state possible. (can't update it) */
export class ConstState<V> extends State<V, never> {
	constructor(value: V) {
		super(value, (_, value) => value);
	}
}

/** State where the transaction is the new value. */
export class BasicState<V> extends State<V, V> {
	constructor(initial: V) {
		super(initial, (newValue) => newValue);
	}
}

/** State for an array. */
export class ArrayState<E> extends State<E[], { add: E } | { remove: E }> {
	constructor(initial: E[]) {
		super(initial, (trans, current) => {
			const list = [...current];
			if ("add" in trans) list.push(trans.add);
			if ("remove" in trans) list.splice(list.indexOf(trans.remove), 1);
			return list;
		});
	}
}

/** Bind the effect callback and call it immediately (with `old = undefined`). */
export const effectNow = <V>(
	s: IReadonlyState<V>,
	effect: EffectFunc<V, V | undefined>,
) => {
	s.effect(effect);
	effect(s.get(), undefined);
};

/**
 * Create a state that depends on another state.
 * The `getValue` function is called immediately.
 * On `state` update, the dependent value is replaced
 * with the return value of the `getValue` function.
 * (see {@link BasicState})
 **/
export const dependentState = <V, U>(
	state: IReadonlyState<V>,
	getValue: (value: V, old: V | undefined, oldThis: U | undefined) => U,
): IReadonlyState<U> => {
	const dependentState = new BasicState(getValue(state.get(), undefined, undefined));
	state.effect((value, old) =>
		dependentState.update(getValue(value, old, dependentState.get())),
	);
	return dependentState;
};

/**
 * Create a state that depends on another state,
 * but times the updates of the former to be less frequent.
 * So if two updates of the original state happen in the span
 * of `delay`ms, only one update will happen on the dependent state.
 * @todo generate an update that happens once after multiple original updates
 *       so that the depenent state doesn't show an outdated value forever
 *       if no more original updates happen.
 * @todo come up with a better name.
 **/
export const lazyState = <T>(
	state: IReadonlyState<T>,
	delay = 500,
): IReadonlyState<T> => {
	const dependent = new BasicState(state.get());
	let last = state.get(); // TODO: use the last variable.
	let updated = true;

	state.effect((value) => {
		last = value;
		if (updated) {
			updated = false;
			setTimeout(() => {
				dependent.update(value);
				updated = true;
			}, delay);
		}
	});

	return dependent;
};

type ExtractTypeValue<T> = T extends IReadonlyState<infer U> ? U : never;
type StatelessArray<S extends IReadonlyState<any>[]> = {
	[P in keyof S]: ExtractTypeValue<S[P]>;
};

/**
 * Create a state that depends on multiple states at once.
 */
export const joinedState = <S extends IReadonlyState<any>[]>(
	...states: S
): IReadonlyState<StatelessArray<S>> => {
	const dependent = new BasicState(states.map((s) => s.get()) as StatelessArray<S>);
	states.forEach((state) => {
		state.effect(() => {
			dependent.update(states.map((other) => other.get()) as StatelessArray<S>);
		});
	});
	return dependent;
};
