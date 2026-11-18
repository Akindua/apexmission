/**
 * Jarvis services module — AI context builder, LLM client, local audio
 * listener, and local persistence.
 *
 * Exports:
 *   - Context builder: buildJarvisContext, JarvisContext, JarvisSuggestion,
 *     JarvisSuggestionType, generateSuggestionId
 *   - Local persistence: getJarvisSuggestions, setJarvisSuggestions,
 *     getPendingSuggestions, applySuggestion, dismissSuggestion,
 *     clearJarvisSuggestions, hasJarvisDisclaimerAck,
 *     setJarvisDisclaimerAck, getJarvisLastGenerated, setJarvisLastGenerated
 *   - LLM client: generateJarvisSuggestions
 *   - Voice client: submitJarvisVoice, JarvisVoiceResult
 *   - Audio listener: LocalAudioListener, AudioListenerState,
 *     AudioListenerConfig, AudioListenerEvents
 */

export {
  buildJarvisContext,
  generateSuggestionId,
  type JarvisContext,
  type JarvisSuggestion,
  type JarvisSuggestionType,
  type Task,
  type ImpactTier,
} from "./context-builder";

export {
  getJarvisSuggestions,
  setJarvisSuggestions,
  getPendingSuggestions,
  applySuggestion,
  dismissSuggestion,
  clearJarvisSuggestions,
  hasJarvisDisclaimerAck,
  setJarvisDisclaimerAck,
  getJarvisLastGenerated,
  setJarvisLastGenerated,
} from "./local-persistence";

export { generateJarvisSuggestions } from "./llm-client";
export { submitJarvisVoice, type JarvisVoiceResult } from "./voice-client";
export {
  LocalAudioListener,
  type AudioListenerState,
  type AudioListenerConfig,
  type AudioListenerEvents,
} from "./audio-listener";
