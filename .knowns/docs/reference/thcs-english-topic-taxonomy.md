---
title: THCS English Topic Taxonomy
createdAt: '2026-03-04T22:27:08.555Z'
updatedAt: '2026-03-04T22:28:02.223Z'
description: >-
  Comprehensive taxonomy of grammar, vocabulary, phonetics topics expected in
  Vietnamese THCS/THPT English exams. Used by AI for topic-level classification
  when generating formative feedback.
tags:
  - reference
  - thcs
  - curriculum
  - ai
---
# THCS English Topic Taxonomy

Reference taxonomy for AI topic-level classification in Vietnamese THCS/THPT English exams. The AI uses this implicitly when generating formative feedback — it's not hardcoded, but these are the expected categories.

## Why This Exists

The `intentBreakdown` from auto-marking only tells you the **question type** (e.g., `mcq-grammar`), not the **specific topic** (e.g., "Past Perfect Tense"). Since there's no `grammarTopic` field on `THCSQuestion`, the AI must infer topics by reading the question text. This taxonomy documents what topics the AI should identify.

## Grammar Topics

Used for: `mcq-grammar`, `verb-form`, `error-identification`, `sentence-rewrite`, `sentence-rewrite-keyword`

| Category | Specific Topics |
|----------|----------------|
| **Tenses** | Present Simple, Present Continuous, Present Perfect, Present Perfect Continuous, Past Simple, Past Continuous, Past Perfect, Future Simple (will), Near Future (going to), Future Continuous |
| **Voice** | Active Voice, Passive Voice (with any tense), Causative (have something done) |
| **Conditionals** | Type 0 (zero), Type 1, Type 2, Type 3, Mixed Conditional |
| **Reported Speech** | Reported Statements, Reported Questions, Reporting Verbs |
| **Clauses** | Relative Clauses (defining/non-defining), Adverbial Clauses (time/reason/purpose/result/concession), Noun Clauses |
| **Comparisons** | Comparative Adjectives/Adverbs, Superlative, Double Comparative (the more...the more), As...as |
| **Articles** | Definite (the), Indefinite (a/an), Zero Article |
| **Agreement** | Subject-Verb Agreement, Pronoun-Antecedent Agreement |
| **Modals** | Can/Could, May/Might, Must/Have to, Should/Ought to, Need, Dare |
| **Gerunds & Infinitives** | Verb + gerund, Verb + infinitive, Verb + both (meaning change) |
| **Prepositions** | Prepositions of Time, Place, Movement, Dependent Prepositions |
| **Connectors** | Conjunctions (and/but/or/so), Transition Words (however/therefore/moreover), Linking Words |
| **Word Order** | Adjective Order, Adverb Position, Question Formation, Inversion |
| **Tag Questions** | Positive/Negative Tag Questions |
| **Wish/If only** | Wish about Present, Past, Future |

## Vocabulary Topics

Used for: `mcq-vocabulary`, `word-form`, `synonym-mcq`, `antonym-mcq`

| Category | Specific Topics |
|----------|----------------|
| **Word Formation** | Prefixes (un-, dis-, re-), Suffixes (-tion, -ment, -ful, -less), Noun↔Verb↔Adj↔Adv conversion |
| **Phrasal Verbs** | Specific phrasal verbs (look after, give up, turn down, etc.) |
| **Collocations** | Verb-Noun (make a decision), Adj-Noun (heavy rain), Adv-Adj (deeply concerned) |
| **Idioms** | Common English idioms tested at THCS level |
| **Topic Vocabulary** | Environment, Technology, Education, Health, Culture, Travel, etc. |
| **Synonyms/Antonyms** | Word meaning relationships |

## Phonetics Topics

Used for: `pronunciation`, `word-stress`

| Category | Specific Topics |
|----------|----------------|
| **Vowel Sounds** | /iː/ vs /ɪ/, /æ/ vs /e/, /ɒ/ vs /ɔː/, diphthongs |
| **Consonant Sounds** | /θ/ vs /ð/, /ʃ/ vs /tʃ/, silent letters |
| **Stress Patterns** | 1st/2nd/3rd syllable stress, stress shift with suffixes |
| **-ed Endings** | /t/, /d/, /ɪd/ pronunciation rules |
| **-s Endings** | /s/, /z/, /ɪz/ pronunciation rules |

## Usage

This taxonomy is referenced by:
- `src/services/formativeFeedback.service.ts` — AI prompt asks for topic classification
- `src/types/thcs-test.types.ts` — `INTENT_SKILL_MAP` maps intents to categories (coarser than this taxonomy)
- The AI freely infers topic labels — this taxonomy is implicit guidance, not a hardcoded constraint

## Source

Research from @task-cybx0j (FormativeFeedback type definition session)
