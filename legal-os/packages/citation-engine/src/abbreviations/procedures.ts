export const PROCEDURE_MAP: Readonly<Record<string, string>> = {
  // Canonical forms
  'רע"א':  'רע"א',
  'ע"א':   'ע"א',
  'ע"פ':   'ע"פ',
  'בג"ץ':  'בג"ץ',
  'דנ"א':  'דנ"א',
  'ת"פ':   'ת"פ',
  'ת"א':   'ת"א',
  'עמ"ש':  'עמ"ש',
  'תפ"ח':  'תפ"ח',
  'פ"ד':   'פ"ד',
  'עת"מ':  'עת"מ',
  'בש"פ':  'בש"פ',
  'ע"ז':   'ע"ז',
  'ח"פ':   'ח"פ',

  // Un-quoted OCR corruptions
  'רעא':   'רע"א',
  'עא':    'ע"א',
  'עפ':    'ע"פ',
  'בגץ':   'בג"ץ',
  'דנא':   'דנ"א',
  'תפ':    'ת"פ',
  'תא':    'ת"א',
  'עמש':   'עמ"ש',
  'תפח':   'תפ"ח',

  // Gershayim (U+05F4) variants
  'רע״א':  'רע"א',
  'ע״א':   'ע"א',
  'ע״פ':   'ע"פ',
  'בג״ץ':  'בג"ץ',
  'דנ״א':  'דנ"א',
  'ת״פ':   'ת"פ',
  'ת״א':   'ת"א',
  'עמ״ש':  'עמ"ש',
  'עת״מ':  'עת"מ',
  'בש״פ':  'בש"פ',
};

export const KNOWN_PROCEDURES: ReadonlySet<string> = new Set(Object.values(PROCEDURE_MAP));

export const PUBLICATION_MAP: Readonly<Record<string, string>> = {
  'נבו':    'נבו',
  'NEVO':   'נבו',
  'nevo':   'נבו',
  'פד':     'פ"ד',
  'פ"ד':    'פ"ד',
  'פ״ד':    'פ"ד',
  'תקעל':   'תק-על',
  'תק-על':  'תק-על',
  'תק-מח':  'תק-מח',
  'תקמח':   'תק-מח',
  'דינים':  'דינים',
};

export const KNOWN_PUBLICATIONS: ReadonlySet<string> = new Set(Object.values(PUBLICATION_MAP));
