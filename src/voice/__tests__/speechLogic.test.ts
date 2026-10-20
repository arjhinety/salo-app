import { chooseLocale, joinTranscript, mapSpeechError, canUseOnDevice } from '../speechLogic';

describe('chooseLocale', () => {
  it('prefers fil-PH, then en-PH, then en-US', () => {
    expect(chooseLocale(['en-US', 'en-PH', 'fil-PH'])).toBe('fil-PH');
    expect(chooseLocale(['en-US', 'en-PH'])).toBe('en-PH');
    expect(chooseLocale(['en-GB', 'en-US'])).toBe('en-US');
  });

  it('returns null when none of the three is listed', () => {
    expect(chooseLocale(['de-DE', 'en-GB'])).toBeNull();
    expect(chooseLocale([])).toBeNull();
  });
});

describe('canUseOnDevice', () => {
  it('is true only when the locale is installed', () => {
    expect(canUseOnDevice('fil-PH', ['fil-PH', 'en-US'])).toBe(true);
    expect(canUseOnDevice('en-PH', ['fil-PH', 'en-US'])).toBe(false);
    expect(canUseOnDevice('en-US', [])).toBe(false);
  });
});

describe('mapSpeechError', () => {
  it('maps the recognizer codes to the screen set', () => {
    expect(mapSpeechError('not-allowed')).toBe('permission');
    expect(mapSpeechError('no-speech')).toBe('no-speech');
    expect(mapSpeechError('speech-timeout')).toBe('no-speech');
    expect(mapSpeechError('network')).toBe('network');
    expect(mapSpeechError('language-not-supported')).toBe('language');
    expect(mapSpeechError('service-not-allowed')).toBe('unavailable');
  });

  it('maps everything else to other, and an app abort to no error', () => {
    expect(mapSpeechError('audio-capture')).toBe('other');
    expect(mapSpeechError('busy')).toBe('other');
    expect(mapSpeechError('client')).toBe('other');
    expect(mapSpeechError('unknown')).toBe('other');
    expect(mapSpeechError('aborted')).toBeNull();
  });
});

describe('joinTranscript', () => {
  it('keeps earlier finals and appends the current words', () => {
    expect(joinTranscript('', 'Kumusta')).toBe('Kumusta');
    expect(joinTranscript('Kumusta', 'may tanong ako')).toBe('Kumusta may tanong ako');
    expect(joinTranscript('Kumusta', '')).toBe('Kumusta');
    expect(joinTranscript('Kumusta', '  ')).toBe('Kumusta');
  });
});
