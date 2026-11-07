/**
 * העברת קבצים מצורפים מ-Gmail לתיקיות "עונה חקלאית" ב-Google Drive.
 *
 * מה הסקריפט עושה:
 *   1. מחפש מיילים עם קבצים מצורפים מ-2025 ו-2026.
 *   2. מסווג כל מייל לפי הנושא ושם הקובץ: תעודת משלוח / הצעת מחיר / חשבונית.
 *   3. שומר את הקבצים בתיקייה של השנה הנכונה (לפי תאריך המייל) ובקטגוריה הנכונה.
 *   4. מסמן את המייל בתווית "נשמר-בדרייב" כדי לא לשמור אותו פעמיים.
 *   מיילים שלא מתאימים לאף קטגוריה - לא נוגעים בהם.
 *   הסקריפט לא מוחק שום דבר מהמייל.
 *
 * הפעלה:
 *   1. להיכנס ל- https://script.google.com ולבחור "פרויקט חדש".
 *   2. למחוק את מה שכתוב שם ולהדביק את כל הקובץ הזה.
 *   3. לבחור בפונקציה  run  וללחוץ "הפעלה" (Run). בפעם הראשונה Google יבקש אישור גישה ל-Gmail ול-Drive.
 *   4. אם יש הרבה מיילים, הסקריפט עוצר אחרי כ-5 דקות - פשוט להפעיל שוב עד שביומן (Execution log) כתוב "סיימתי".
 *   אופציונלי: להפעיל פעם אחת את  installDailyTrigger  כדי שזה ירוץ אוטומטית כל יום על מיילים חדשים.
 */

const FOLDERS = {
  2025: {
    invoice:  '1D4QxQL4KoU120azuzk_A6ywYfdj6JG8H', // עונה חקלאית 2025 / חשבוניות
    delivery: '1Bmvj7cI-EOeaU8PQTGr5PjNVACPCTTKT', // עונה חקלאית 2025 / תעודות משלוח
    quote:    '1h1gbC6s-kIm0dDQE0YT-e-W6XiGn6EEe', // עונה חקלאית 2025 / הצעות מחיר
  },
  2026: {
    invoice:  '1Zp5iGHF-kJE2_QyRvje_0SNrOgmZGRdr', // עונה חקלאית 2026 / חשבוניות
    delivery: '1mYcQxA-p0G1CUNgJQ2y5IclCT9-V2a_T', // עונה חקלאית 2026 / תעודות משלוח
    quote:    '1F4LTTa63mZA2U-Y-8xNZ8T65ebggPDM2', // עונה חקלאית 2026 / הצעות מחיר
  },
};

// מילות מפתח לכל קטגוריה (נבדקות בנושא המייל ובשם הקובץ, לפי הסדר הזה)
const RULES = [
  { category: 'delivery', words: ['תעודת משלוח', 'תעודות משלוח', 'ת. משלוח', 'ת.משלוח', 'delivery note'] },
  { category: 'quote',    words: ['הצעת מחיר', 'הצעות מחיר', 'quotation', 'quote'] },
  { category: 'invoice',  words: ['חשבונית', 'חשבוניות', 'invoice', 'חש. מרכזת'] },
];

// סוגי קבצים שנשמרים (מסמכים ותמונות סרוקות). חתימות ולוגואים בתוך המייל לא נשמרים.
const ALLOWED_EXT = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'jpg', 'jpeg', 'png', 'htm', 'html', 'tif', 'tiff'];
const MIN_IMAGE_BYTES = 30 * 1024;

const DONE_LABEL = 'נשמר-בדרייב';
const QUERY = 'has:attachment after:2025/01/01 before:2027/01/01 -label:' + DONE_LABEL;
const MAX_RUNTIME_MS = 5 * 60 * 1000;

function run() {
  const start = Date.now();
  const label = GmailApp.getUserLabelByName(DONE_LABEL) || GmailApp.createLabel(DONE_LABEL);
  const stats = { saved: 0, duplicate: 0, skippedThreads: 0 };
  const skipped = {};
  let offset = 0;

  while (Date.now() - start < MAX_RUNTIME_MS) {
    const threads = GmailApp.search(QUERY, offset, 50);
    if (threads.length === 0) {
      Logger.log('סיימתי ✔  נשמרו %s קבצים, %s כבר היו קיימים, %s מיילים לא שייכים לקטגוריות.',
        stats.saved, stats.duplicate, stats.skippedThreads);
      return;
    }
    let stayInSearch = 0;
    for (const thread of threads) {
      if (Date.now() - start > MAX_RUNTIME_MS) break;
      if (skipped[thread.getId()]) { stayInSearch++; continue; }
      if (processThread(thread, stats)) {
        thread.addLabel(label); // מייל שטופל יוצא מהחיפוש
      } else {
        skipped[thread.getId()] = true; // לא שייך לקטגוריה - נשאר בחיפוש, מדלגים עליו
        stats.skippedThreads++;
        stayInSearch++;
      }
    }
    offset += stayInSearch;
  }
  Logger.log('נגמר הזמן - להפעיל שוב את run כדי להמשיך. עד עכשיו נשמרו %s קבצים.', stats.saved);
}

/** מחזיר true אם המייל שייך לקטגוריה כלשהי (וקבציו נשמרו). */
function processThread(thread, stats) {
  let matched = false;
  for (const msg of thread.getMessages()) {
    const year = msg.getDate().getFullYear();
    if (!FOLDERS[year]) continue;
    const subject = msg.getSubject() || '';
    const attachments = msg.getAttachments({ includeInlineImages: false });
    for (const att of attachments) {
      const name = att.getName() || 'קובץ';
      if (!isDocument_(att, name)) continue;
      const category = classify_(subject + ' ' + name);
      if (!category) continue;
      matched = true;
      const folder = DriveApp.getFolderById(FOLDERS[year][category]);
      const fileName = buildName_(msg, name);
      if (folder.getFilesByName(fileName).hasNext() || folder.getFilesByName(name).hasNext()) {
        stats.duplicate++;
        continue;
      }
      folder.createFile(att.copyBlob()).setName(fileName);
      stats.saved++;
      Logger.log('%s | %s | %s', year, category, fileName);
    }
  }
  return matched;
}

function classify_(text) {
  const t = text.toLowerCase();
  for (const rule of RULES) {
    if (rule.words.some(w => t.indexOf(w.toLowerCase()) !== -1)) return rule.category;
  }
  return null;
}

function isDocument_(att, name) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  // בודקים לפי סיומת ולא לפי סוג הקובץ, כי למשל חישתיל שולחים PDF בלי סוג מוגדר
  if (ALLOWED_EXT.indexOf(ext) === -1) return false;
  if (['jpg', 'jpeg', 'png'].indexOf(ext) !== -1 && att.getSize() < MIN_IMAGE_BYTES) return false;
  return true;
}

// שם קובץ ברור: תאריך - שולח - שם הקובץ המקורי
function buildName_(msg, original) {
  const date = Utilities.formatDate(msg.getDate(), 'Asia/Jerusalem', 'yyyy-MM-dd');
  let sender = msg.getFrom().replace(/<.*>/, '').replace(/["']/g, '').trim();
  if (!sender) sender = msg.getFrom();
  sender = sender.replace(/[\\/:*?"<>|]/g, '').slice(0, 40);
  return date + ' - ' + sender + ' - ' + original;
}

/** אופציונלי: הרצה אוטומטית כל יום ב-06:00 על מיילים חדשים. */
function installDailyTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'run')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('run').timeBased().everyDays(1).atHour(6).create();
  Logger.log('הוגדרה הרצה יומית.');
}
