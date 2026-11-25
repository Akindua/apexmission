/**
 * AI Chief of Staff services module — AI context builder, LLM client, local audio
 * listener, and local persistence.
 *
 * Exports:
 *   - Context builder: buildChiefOfStaffContext, ChiefOfStaffContext, ChiefOfStaffSuggestion,
 *     ChiefOfStaffSuggestionType, generateSuggestionId
 *   - Local persistence: getChiefOfStaffSuggestions, setChiefOfStaffSuggestions,
 *     getPendingSuggestions, applySuggestion, dismissSuggestion,
 *     clearChiefOfStaffSuggestions, hasChiefOfStaffDisclaimerAck,
 *     setChiefOfStaffDisclaimerAck, getChiefOfStaffLastGenerated, setChiefOfStaffLastGenerated
 *   - LLM client: generateChiefOfStaffSuggestions
 *   - Voice client: submitChiefOfStaffVoice, ChiefOfStaffVoiceResult
 *   - Audio listener: LocalAudioListener, AudioListenerState,
 *     AudioListenerConfig, AudioListenerEvents
 */

export {
  buildChiefOfStaffContext,
  generateSuggestionId,
  type ChiefOfStaffContext,
  type ChiefOfStaffSuggestion,
  type ChiefOfStaffSuggestionType,
  type Task,
  type ImpactTier,
} from "./context-builder";

export {
  getChiefOfStaffSuggestions,
  setChiefOfStaffSuggestions,
  getPendingSuggestions,
  applySuggestion,
  dismissSuggestion,
  clearChiefOfStaffSuggestions,
  hasChiefOfStaffDisclaimerAck,
  setChiefOfStaffDisclaimerAck,
  getChiefOfStaffLastGenerated,
  setChiefOfStaffLastGenerated,
} from "./local-persistence";

export { generateChiefOfStaffSuggestions } from "./llm-client";
export { submitChiefOfStaffVoice, type ChiefOfStaffVoiceResult } from "./voice-client";
export {
  LocalAudioListener,
  type AudioListenerState,
  type AudioListenerConfig,
  type AudioListenerEvents,
} from "./audio-listener";