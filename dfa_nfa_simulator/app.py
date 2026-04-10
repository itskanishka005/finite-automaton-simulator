
from flask import Flask, render_template, request, jsonify
from collections import defaultdict, deque
import json, re

app = Flask(__name__)

# ─────────────────────────────────────────────
# DFA / NFA core engine
# ─────────────────────────────────────────────

def epsilon_closure(states, transitions):
    """Compute ε-closure for a set of NFA states."""
    closure = set(states)
    stack = list(states)
    while stack:
        s = stack.pop()
        for t in transitions.get(s, {}).get("ε", []):
            if t not in closure:
                closure.add(t)
                stack.append(t)
    return frozenset(closure)


def nfa_move(states, symbol, transitions):
    """Compute move(states, symbol) for NFA."""
    result = set()
    for s in states:
        result.update(transitions.get(s, {}).get(symbol, []))
    return result


def simulate_dfa(automaton, input_string):
    """
    Simulate DFA step by step.
    Returns list of steps: {state, symbol, next_state, transition_used}
    Plus final accept/reject.
    """
    states       = automaton["states"]
    alphabet     = automaton["alphabet"]
    transitions  = automaton["transitions"]   # {state: {symbol: next_state}}
    start        = automaton["start_state"]
    accepting    = set(automaton["accepting_states"])

    steps = []
    current = start

    for i, ch in enumerate(input_string):
        if ch not in alphabet:
            steps.append({
                "step": i,
                "current_states": [current],
                "symbol": ch,
                "next_states": [],
                "error": f"Symbol '{ch}' not in alphabet"
            })
            return {"steps": steps, "accepted": False, "error": f"Symbol '{ch}' not in alphabet"}

        nxt = transitions.get(current, {}).get(ch)
        steps.append({
            "step": i,
            "current_states": [current],
            "symbol": ch,
            "next_states": [nxt] if nxt else [],
            "transition": f"δ({current},{ch})={nxt}" if nxt else f"δ({current},{ch})=∅"
        })
        if nxt is None:
            return {"steps": steps, "accepted": False, "final_states": []}
        current = nxt

    accepted = current in accepting
    return {
        "steps": steps,
        "accepted": accepted,
        "final_states": [current],
        "final_state": current
    }


def simulate_nfa(automaton, input_string):
    """
    Simulate NFA step by step using subset construction on-the-fly.
    """
    transitions  = automaton["transitions"]   # {state: {symbol: [states]}}
    alphabet     = automaton["alphabet"]
    start        = automaton["start_state"]
    accepting    = set(automaton["accepting_states"])

    current_states = epsilon_closure({start}, transitions)
    steps = []

    for i, ch in enumerate(input_string):
        if ch not in alphabet:
            return {"steps": steps, "accepted": False, "error": f"Symbol '{ch}' not in alphabet"}

        moved       = nfa_move(current_states, ch, transitions)
        next_states = epsilon_closure(moved, transitions)

        steps.append({
            "step": i,
            "current_states": sorted(current_states),
            "symbol": ch,
            "next_states": sorted(next_states),
            "transition": f"δ({{{','.join(sorted(current_states))}}},{ch})={{{','.join(sorted(next_states))}}}"
        })
        current_states = next_states

    accepted = bool(current_states & accepting)
    return {
        "steps": steps,
        "accepted": accepted,
        "final_states": sorted(current_states)
    }


# ─────────────────────────────────────────────
# Auto-generation helpers
# ─────────────────────────────────────────────

def auto_generate_dfa(alphabet, accept_strings):
    """
    Generate a minimal DFA that accepts a given set of strings
    by building a trie-based DFA.
    """
    # Build trie as DFA
    transitions = {}
    state_counter = [0]

    def new_state():
        s = f"q{state_counter[0]}"
        state_counter[0] += 1
        transitions[s] = {}
        return s

    start = new_state()
    accepting = set()
    dead = new_state()

    # dead state loops on everything
    for sym in alphabet:
        transitions[dead][sym] = dead

    for word in accept_strings:
        cur = start
        for ch in word:
            if ch not in alphabet:
                continue
            if ch not in transitions[cur]:
                transitions[cur][ch] = new_state()
            cur = transitions[cur][ch]
        accepting.add(cur)

    # Fill missing transitions → dead state
    all_states = list(transitions.keys())
    for s in all_states:
        for sym in alphabet:
            if sym not in transitions[s]:
                transitions[s][sym] = dead

    return {
        "type": "DFA",
        "states": all_states,
        "alphabet": list(alphabet),
        "transitions": transitions,
        "start_state": start,
        "accepting_states": list(accepting)
    }


def auto_generate_nfa(alphabet, accept_strings):
    """
    Generate an NFA that uses ε-transitions and non-determinism
    to accept the given strings (union NFA).
    """
    transitions = {}
    counter = [0]

    def new_state():
        s = f"q{counter[0]}"
        counter[0] += 1
        transitions[s] = {}
        return s

    start = new_state()
    accepting = []

    # For each accept string build a linear chain from start via ε
    for word in accept_strings:
        chain_start = new_state()
        transitions[start].setdefault("ε", []).append(chain_start)
        cur = chain_start
        for ch in word:
            if ch not in alphabet:
                continue
            nxt = new_state()
            transitions[cur].setdefault(ch, []).append(nxt)
            cur = nxt
        accepting.append(cur)
        transitions[cur] = transitions.get(cur, {})

    return {
        "type": "NFA",
        "states": list(transitions.keys()),
        "alphabet": list(alphabet),
        "transitions": {s: {k: v for k, v in d.items()} for s, d in transitions.items()},
        "start_state": start,
        "accepting_states": accepting
    }


# ─────────────────────────────────────────────
# Validation
# ─────────────────────────────────────────────

def validate_automaton(data):
    errors = []
    required = ["type", "states", "alphabet", "transitions", "start_state", "accepting_states"]
    for f in required:
        if f not in data:
            errors.append(f"Missing field: {f}")

    if errors:
        return errors

    if data["start_state"] not in data["states"]:
        errors.append(f"Start state '{data['start_state']}' not in states list.")

    for s in data["accepting_states"]:
        if s not in data["states"]:
            errors.append(f"Accepting state '{s}' not in states list.")

    return errors


# ─────────────────────────────────────────────
# Routes
# ─────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/simulate", methods=["POST"])
def simulate():
    body = request.get_json(force=True)
    automaton    = body.get("automaton", {})
    input_string = body.get("input_string", "")

    errs = validate_automaton(automaton)
    if errs:
        return jsonify({"error": errs[0]}), 400

    atype = automaton.get("type", "DFA").upper()
    if atype == "DFA":
        result = simulate_dfa(automaton, input_string)
    else:
        result = simulate_nfa(automaton, input_string)

    return jsonify(result)


@app.route("/api/autogenerate", methods=["POST"])
def autogenerate():
    body          = request.get_json(force=True)
    atype         = body.get("type", "DFA").upper()
    alphabet      = list(body.get("alphabet", []))
    test_strings  = body.get("accept_strings", [])

    if not alphabet:
        return jsonify({"error": "Alphabet cannot be empty."}), 400

    if atype == "DFA":
        automaton = auto_generate_dfa(alphabet, test_strings)
    else:
        automaton = auto_generate_nfa(alphabet, test_strings)

    return jsonify({"automaton": automaton})


@app.route("/api/validate", methods=["POST"])
def validate():
    body = request.get_json(force=True)
    automaton = body.get("automaton", {})
    errs = validate_automaton(automaton)
    if errs:
        return jsonify({"valid": False, "errors": errs}), 400
    return jsonify({"valid": True})


if __name__ == "__main__":
    app.run(debug=True, port=5000)
