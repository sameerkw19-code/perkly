"use client";
import { useEffect, useState } from "react";

export type Lang = "he" | "ar" | "en";
export const LANGS: Lang[] = ["he", "ar", "en"];
export const LANG_LABEL: Record<Lang, string> = { he: "עברית", ar: "العربية", en: "English" };

type Entry = [he: string, ar: string, en: string];

// Placeholders like {n} are filled by t(key, { n: 3 }).
const words: Record<string, Entry> = {
  // Navigation and layout
  overview: ["סקירה כללית", "نظرة عامة", "Overview"],
  customers: ["לקוחות וכרטיסים", "العملاء والبطاقات", "Customers & cards"],
  station: ["עמדת עובד", "واجهة الموظف", "Staff station"],
  team: ["צוות", "الفريق", "Team"],
  settings: ["הגדרות העסק", "إعدادات المشروع", "Business settings"],
  hello: ["לקוחות חוזרים. עסק צומח.", "عملاء يرجعون. عمل يكبر.", "More regulars. More growth."],
  subtitle: ["כל הכרטיסים, החותמות וההטבות במקום אחד.", "كل البطاقات والأختام والمكافآت في مكان واحد.", "Every card, stamp and reward in one place."],
  stationTitle: ["סריקה ואישור פעולות", "المسح وتأكيد العمليات", "Scan and confirm"],
  stationSubtitle: ["סורקים את הכרטיס, בודקים את הלקוח ומאשרים.", "امسح البطاقة، تأكد من العميل ثم أكّد.", "Scan the card, check the customer, then confirm."],
  pilot: ["פיילוט", "تجربة", "Pilot"],
  loading: ["טוען…", "جارٍ التحميل…", "Loading…"],
  retry: ["נסו שוב", "حاول مجدداً", "Try again"],
  save: ["שמירה", "حفظ", "Save"],
  saved: ["נשמר", "تم الحفظ", "Saved"],
  cancel: ["ביטול", "إلغاء", "Cancel"],
  close: ["סגירה", "إغلاق", "Close"],
  copy: ["העתקה", "نسخ", "Copy"],
  copied: ["הועתק", "تم النسخ", "Copied"],
  whatsapp: ["שליחה בוואטסאפ", "إرسال عبر واتساب", "Send on WhatsApp"],
  roleOwner: ["בעלים", "مالك", "Owner"],
  roleStaff: ["עובד", "موظف", "Staff"],
  choose: ["בחירת עסק", "اختر المشروع", "Choose business"],

  // Auth
  signIn: ["כניסה", "تسجيل الدخول", "Sign in"],
  signUp: ["פתיחת חשבון לעסק", "إنشاء حساب لمشروع", "Create a business account"],
  signOut: ["יציאה", "خروج", "Sign out"],
  email: ["אימייל", "البريد الإلكتروني", "Email"],
  password: ["סיסמה", "كلمة المرور", "Password"],
  passwordHint: ["לפחות 8 תווים", "8 أحرف على الأقل", "At least 8 characters"],
  yourName: ["השם שלך", "اسمك", "Your name"],
  signupCode: ["קוד הרשמה", "رمز التسجيل", "Signup code"],
  signupCodeHint: ["נדרש רק אם קיבלתם קוד מ־Perkly", "مطلوب فقط إذا حصلت على رمز من Perkly", "Only needed if Perkly gave you a code"],
  haveAccount: ["כבר יש לך חשבון? כניסה", "لديك حساب؟ تسجيل الدخول", "Already have an account? Sign in"],
  noAccount: ["בעל עסק חדש? פתיחת חשבון", "صاحب مشروع جديد؟ إنشاء حساب", "New business owner? Create an account"],
  staffNoAccount: ["עובדים מצטרפים רק דרך קישור הזמנה מבעל העסק.", "ينضم الموظفون فقط عبر رابط دعوة من صاحب المشروع.", "Staff join only through an invite link from the owner."],
  noPasswordReset: ["שכחתם סיסמה? איפוס עדיין לא זמין. בעל העסק יכול לשלוח לעובד הזמנה חדשה.", "نسيت كلمة المرور؟ الاستعادة غير متاحة بعد. يمكن لصاحب المشروع إرسال دعوة جديدة للموظف.", "Forgot your password? Reset is not available yet. Owners can send staff a new invite."],

  // Errors (keys match API error codes)
  err_bad_login: ["אימייל או סיסמה שגויים.", "البريد أو كلمة المرور غير صحيحة.", "Wrong email or password."],
  err_email_taken: ["האימייל הזה כבר רשום. נסו להיכנס.", "هذا البريد مسجل. جرّب تسجيل الدخول.", "This email is already registered. Try signing in."],
  err_email_taken_signin: ["האימייל כבר רשום. היכנסו קודם, ואז פתחו שוב את קישור ההזמנה.", "البريد مسجل. سجّل الدخول أولاً ثم افتح رابط الدعوة مجدداً.", "This email is registered. Sign in first, then open the invite link again."],
  err_weak_password: ["הסיסמה צריכה לפחות 8 תווים.", "كلمة المرور تحتاج 8 أحرف على الأقل.", "The password needs at least 8 characters."],
  err_signup_code: ["קוד ההרשמה חסר או שגוי.", "رمز التسجيل مفقود أو غير صحيح.", "The signup code is missing or wrong."],
  err_rate_limited: ["יותר מדי ניסיונות. נסו שוב בעוד כמה דקות.", "محاولات كثيرة. حاول بعد بضع دقائق.", "Too many attempts. Try again in a few minutes."],
  err_bad_details: ["בדקו את הפרטים שהוזנו.", "تحقق من البيانات المدخلة.", "Check the details you entered."],
  err_phone_exists: ["מספר הטלפון כבר רשום בעסק הזה.", "رقم الهاتف مسجل في هذا المشروع.", "This phone is already registered in this business."],
  err_forbidden: ["אין לך הרשאה לפעולה הזו.", "ليس لديك صلاحية لهذه العملية.", "You don't have permission for this action."],
  err_not_found: ["לא נמצא, או שאין לך גישה.", "غير موجود، أو ليس لديك وصول.", "Not found, or you don't have access."],
  err_invite_invalid: ["ההזמנה פגה, בוטלה או כבר נוצלה. בקשו הזמנה חדשה.", "الدعوة منتهية أو ملغاة أو مستخدمة. اطلب دعوة جديدة.", "This invite expired, was cancelled or was already used. Ask for a new one."],
  err_reward_ready: ["ההטבה כבר זמינה. יש לממש אותה לפני חותמת נוספת.", "المكافأة جاهزة. يجب استخدامها قبل ختم إضافي.", "The reward is ready. Redeem it before adding another stamp."],
  err_not_ready: ["ההטבה עדיין לא זמינה ללקוח הזה.", "المكافأة غير جاهزة لهذا الزبون بعد.", "This customer's reward isn't ready yet."],
  err_out_of_range: ["התיקון היה מוציא את הכרטיס מהטווח המותר.", "التصحيح يُخرج البطاقة عن النطاق المسموح.", "That correction would take the card out of range."],
  err_note_required: ["צריך לכתוב סיבה לתיקון.", "يجب كتابة سبب للتصحيح.", "Please write a reason for the correction."],
  err_unknown_card: ["הכרטיס לא שייך לעסק הזה.", "البطاقة لا تتبع هذا المشروع.", "This card doesn't belong to this business."],
  err_join_invalid: ["קישור ההצטרפות לא פעיל. בקשו מהעסק קוד חדש.", "رابط الانضمام غير فعال. اطلب رمزاً جديداً من المشروع.", "This join link isn't active. Ask the business for a new one."],
  err_terms_required: ["יש לאשר את תנאי השימוש בפרטים.", "يجب الموافقة على شروط استخدام البيانات.", "Please accept the data terms."],
  err_signin: ["פג תוקף הכניסה. היכנסו שוב.", "انتهت الجلسة. سجّل الدخول مجدداً.", "Your session ended. Sign in again."],
  err_network: ["אין חיבור לשרת, והפעולה לא אושרה. נסו שוב.", "لا اتصال بالخادم ولم تُؤكَّد العملية. حاول مجدداً.", "No connection to the server; the action wasn't confirmed. Try again."],
  err_generic: ["הפעולה לא הושלמה. נסו שוב.", "تعذر إكمال العملية. حاول مجدداً.", "Couldn't complete the action. Try again."],
  offline: ["אין חיבור לאינטרנט. פעולות לא יישלחו עד שהחיבור יחזור.", "لا يوجد إنترنت. لن تُرسل العمليات حتى يعود الاتصال.", "You're offline. Actions won't be sent until you reconnect."],

  // Overview
  range7: ["7 ימים", "7 أيام", "7 days"],
  range30: ["30 יום", "30 يوماً", "30 days"],
  range90: ["90 יום", "90 يوماً", "90 days"],
  rangeAll: ["כל הזמן", "كل الوقت", "All time"],
  statCustomers: ["לקוחות רשומים", "زبائن مسجلون", "Registered customers"],
  statNew: ["{n} חדשים בתקופה", "{n} جدد في الفترة", "{n} new in this period"],
  statStamps: ["חותמות שניתנו", "أختام مُنحت", "Stamps given"],
  statReady: ["הטבות זמינות עכשיו", "مكافآت جاهزة الآن", "Rewards ready now"],
  statRedeemed: ["הטבות שמומשו", "مكافآت مُستخدمة", "Rewards redeemed"],
  inRange: ["בתקופה שנבחרה", "في الفترة المختارة", "In the selected period"],
  rightNow: ["נכון לעכשיו", "حالياً", "Right now"],
  history: ["פעילות אחרונה", "آخر النشاطات", "Recent activity"],
  empty: ["עדיין אין פעילות. הכרטיס הראשון מתחיל כאן.", "لا يوجد نشاط بعد. البطاقة الأولى تبدأ هنا.", "No activity yet. Your first card starts here."],
  ev_stamp: ["חותמת", "ختم", "Stamp"],
  ev_redeem: ["מימוש הטבה", "استخدام مكافأة", "Reward redeemed"],
  ev_adjust: ["תיקון", "تصحيح", "Correction"],
  by: ["על ידי {name}", "بواسطة {name}", "by {name}"],
  alerts: ["פעילות חריגה בשעה האחרונה", "نشاط غير عادي في الساعة الأخيرة", "Unusual activity in the last hour"],
  alertCustomer: ["{name} קיבל/ה {n} חותמות", "{name} حصل على {n} أختام", "{name} received {n} stamps"],
  alertStaff: ["{name} ביצע/ה {n} פעולות", "{name} نفّذ {n} عمليات", "{name} performed {n} actions"],

  // Card
  card: ["הכרטיס של העסק שלך", "بطاقة مشروعك", "Your business card"],
  reward: ["ההטבה", "المكافأة", "Reward"],
  stampsOf: ["{n} מתוך {t}", "{n} من {t}", "{n} of {t}"],
  toGo: ["עוד {k} להטבה", "باقي {k} للمكافأة", "{k} more to your reward"],
  earned: ["ההטבה מחכה לך! הציגו את הכרטיס לעובד.", "مكافأتك جاهزة! أظهر البطاقة للموظف.", "Your reward is ready! Show this card to the staff."],
  showQr: ["הציגו את הקוד לעובד לסריקה.", "أظهر الرمز للموظف ليمسحه.", "Show this code to the staff to scan."],
  qrNote: ["הסריקה לבדה לא מוסיפה חותמת. העובד מאשר כל פעולה.", "المسح وحده لا يضيف ختماً. الموظف يؤكد كل عملية.", "Scanning alone doesn't add a stamp. Staff confirm every action."],
  walletHint: ["הוספה ל־Apple Wallet ול־Google Wallet עדיין לא זמינה.", "الإضافة إلى Apple Wallet وGoogle Wallet غير متاحة بعد.", "Adding to Apple Wallet and Google Wallet isn't available yet."],
  cardNotFound: ["הכרטיס לא נמצא. ייתכן שהקישור הוחלף. בקשו מהעסק קישור חדש.", "البطاقة غير موجودة. ربما تم تغيير الرابط. اطلب رابطاً جديداً من المشروع.", "Card not found. The link may have been replaced. Ask the business for a new one."],
  refresh: ["רענון", "تحديث", "Refresh"],
  customerName: ["שם הלקוח", "اسم الزبون", "Name"],
  saveLinkHint: ["שמרו את הקישור הזה (מועדפים או מסך הבית). הוא הכרטיס שלכם.", "احفظ هذا الرابط (المفضلة أو الشاشة الرئيسية). هذه بطاقتك.", "Save this link (bookmark or home screen). It is your card."],

  // Customers
  all: ["כל הלקוחות", "كل الزبائن", "All customers"],
  name: ["שם הלקוח", "اسم الزبون", "Customer name"],
  phone: ["מספר טלפון", "رقم الهاتف", "Phone number"],
  phoneHint: ["למשל 050-1234567", "مثلاً 050-1234567", "e.g. 050-1234567"],
  balance: ["מצב הכרטיס", "حالة البطاقة", "Card status"],
  marketingCol: ["דיוור", "رسائل", "Marketing"],
  yes: ["כן", "نعم", "Yes"],
  no: ["לא", "لا", "No"],
  actions: ["פעולות", "إجراءات", "Actions"],
  newCustomer: ["לקוח חדש", "زبون جديد", "New customer"],
  search: ["חיפוש לפי שם או טלפון", "بحث بالاسم أو الهاتف", "Search by name or phone"],
  searchHint: ["לפחות 2 אותיות או 4 ספרות", "حرفان على الأقل أو 4 أرقام", "At least 2 letters or 4 digits"],
  noCustomer: ["לא נמצאו לקוחות", "لم يتم العثور على زبائن", "No customers found"],
  export: ["ייצוא CSV", "تصدير CSV", "Export CSV"],
  privacy: ["הפרטים משמשים לניהול הכרטיס בלבד. הודעות שיווקיות לא נשלחות.", "تُستخدم البيانات لإدارة البطاقة فقط. لا تُرسل رسائل تسويقية.", "Details are used only to manage the card. No marketing messages are sent."],
  customerCreated: ["הלקוח נרשם. זה הקישור לכרטיס שלו:", "تم تسجيل الزبون. هذا رابط بطاقته:", "Customer registered. This is their card link:"],
  cardLinkHint: ["שלחו את הקישור ללקוח עצמו בלבד. מי שמחזיק בקישור יכול לראות את הכרטיס.", "أرسل الرابط للزبون نفسه فقط. من يملك الرابط يرى البطاقة.", "Send the link only to the customer. Anyone with the link can view the card."],
  newLink: ["קישור חדש לכרטיס", "رابط جديد للبطاقة", "New card link"],
  newLinkConfirm: ["הקישור הקודם של הלקוח יפסיק לעבוד. להמשיך?", "سيتوقف رابط الزبون السابق عن العمل. متابعة؟", "The customer's previous link will stop working. Continue?"],
  correct: ["תיקון", "تصحيح", "Correct"],
  correctTitle: ["תיקון יתרה", "تصحيح الرصيد", "Correct balance"],
  correctHint: ["התיקון נשמר בהיסטוריה עם הסיבה ושם המבצע. היסטוריה לא נמחקת.", "يُحفظ التصحيح في السجل مع السبب واسم المنفّذ. لا يُحذف السجل.", "Corrections are logged with the reason and who made them. History is never deleted."],
  reason: ["סיבה", "السبب", "Reason"],
  addOne: ["הוספת חותמת אחת", "إضافة ختم واحد", "Add one stamp"],
  removeOne: ["הורדת חותמת אחת", "إزالة ختم واحد", "Remove one stamp"],

  // Station
  scan: ["סריקת כרטיס לקוח", "مسح بطاقة الزبون", "Scan a customer card"],
  scanHint: ["סורקים את הקוד, בודקים שזה הלקוח הנכון ומאשרים.", "امسح الرمز، تأكد أنه الزبون الصحيح ثم أكّد.", "Scan the code, check it's the right customer, then confirm."],
  camera: ["פתיחת מצלמה", "فتح الكاميرا", "Open camera"],
  stop: ["סגירת מצלמה", "إغلاق الكاميرا", "Stop camera"],
  manual: ["או חיפוש ידני", "أو بحث يدوي", "Or search manually"],
  cameraError: ["אין גישה למצלמה. אפשרו מצלמה בהגדרות הדפדפן, או חפשו ידנית.", "لا وصول للكاميرا. اسمح بالكاميرا من إعدادات المتصفح أو ابحث يدوياً.", "No camera access. Allow the camera in browser settings, or search manually."],
  selectHint: ["בחרו לקוח כדי לראות את הכרטיס.", "اختر زبوناً لرؤية البطاقة.", "Pick a customer to see their card."],
  addStamp: ["אישור חותמת", "تأكيد ختم", "Confirm stamp"],
  redeem: ["אישור מימוש הטבה", "تأكيد استخدام المكافأة", "Confirm reward"],
  confirmRedeem: ["לממש את ההטבה של {name}? מתחיל סבב חדש.", "استخدام مكافأة {name}؟ تبدأ جولة جديدة.", "Redeem {name}'s reward? A new round starts."],
  stampOk: ["החותמת נשמרה בשרת", "تم حفظ الختم في الخادم", "Stamp saved on the server"],
  redeemOk: ["ההטבה מומשה. מתחיל סבב חדש.", "تم استخدام المكافأة. بدأت جولة جديدة.", "Reward redeemed. A new round has started."],
  replayed: ["הפעולה כבר נשמרה קודם ולא נספרה פעמיים.", "العملية حُفظت سابقاً ولم تُحسب مرتين.", "This action was already saved and wasn't counted twice."],
  sending: ["שולח…", "جارٍ الإرسال…", "Sending…"],
  myRecent: ["הפעולות האחרונות שלי", "آخر عملياتي", "My recent actions"],

  // Team
  teamHint: ["עובדים יכולים לסרוק, להוסיף חותמות, לממש הטבות ולרשום לקוחות. הם לא רואים את רשימת הלקוחות המלאה ולא משנים הגדרות.", "يمكن للموظفين المسح وإضافة الأختام واستخدام المكافآت وتسجيل الزبائن. لا يرون القائمة الكاملة ولا يغيرون الإعدادات.", "Staff can scan, add stamps, redeem rewards and register customers. They can't see the full customer list or change settings."],
  inviteStaff: ["הזמנת עובד", "دعوة موظف", "Invite staff"],
  inviteLabel: ["שם העובד (לזיהוי שלך)", "اسم الموظف (للتعريف)", "Staff name (for your reference)"],
  inviteCreated: ["קישור ההזמנה מוכן. שלחו אותו לעובד. הוא תקף 7 ימים ולשימוש אחד.", "رابط الدعوة جاهز. أرسله للموظف. صالح 7 أيام ولمرة واحدة.", "The invite link is ready. Send it to the staff member. It works once and expires in 7 days."],
  pendingInvites: ["הזמנות שעוד לא נוצלו", "دعوات لم تُستخدم بعد", "Invites not used yet"],
  cancelInvite: ["ביטול הזמנה", "إلغاء الدعوة", "Cancel invite"],
  revoke: ["ביטול גישה", "إلغاء الوصول", "Revoke access"],
  revokeConfirm: ["לבטל את הגישה של {name}? היא תיחסם מיד בכל המכשירים.", "إلغاء وصول {name}؟ سيتوقف فوراً على كل الأجهزة.", "Revoke {name}'s access? It stops immediately on every device."],
  revokedOn: ["הגישה בוטלה", "تم إلغاء الوصول", "Access revoked"],
  expiresOn: ["בתוקף עד {d}", "صالح حتى {d}", "Valid until {d}"],

  // Settings / join
  businessName: ["שם העסק", "اسم المشروع", "Business name"],
  rewardText: ["תיאור ההטבה", "وصف المكافأة", "Reward description"],
  target: ["רכישות עד להטבה", "مشتريات حتى المكافأة", "Purchases until the reward"],
  color: ["צבע הכרטיס", "لون البطاقة", "Card color"],
  targetNote: ["שינוי מספר הרכישות חל על כרטיסים חדשים, ועל כרטיסים קיימים רק מהסבב הבא אחרי מימוש.", "تغيير العدد يسري على البطاقات الجديدة، وعلى الحالية من الجولة التالية بعد الاستخدام فقط.", "A new number applies to new cards, and to existing cards only from their next round after a redemption."],
  joinQr: ["QR להצטרפות לקוחות", "رمز QR لانضمام الزبائن", "Customer join QR"],
  joinQrHint: ["הדפיסו והציבו בקופה. לקוחות סורקים, נרשמים ומקבלים כרטיס. הסריקה לא מוסיפה חותמות.", "اطبعه وضعه عند الصندوق. يمسح الزبائن ويسجلون ويحصلون على بطاقة. المسح لا يضيف أختاماً.", "Print it and place it at the counter. Customers scan, sign up and get a card. Scanning never adds stamps."],
  newJoinCode: ["החלפת קוד ההצטרפות", "تغيير رمز الانضمام", "Replace join code"],
  newJoinConfirm: ["ה־QR הקודם יפסיק לעבוד. להמשיך?", "سيتوقف رمز QR السابق عن العمل. متابعة؟", "The previous QR will stop working. Continue?"],
  newBusiness: ["עסק נוסף", "مشروع إضافي", "Add another business"],
  welcome: ["בואו ניצור את העסק הראשון שלך", "لننشئ مشروعك الأول", "Let's create your first business"],
  welcomeHint: ["מגדירים הטבה, מוסיפים לקוח ומתחילים לצבור חותמות.", "حدد المكافأة، أضف زبوناً وابدأ بجمع الأختام.", "Set a reward, add a customer and start collecting stamps."],
  noAccess: ["אין לך גישה לאף עסק כרגע. אם אתם עובדים, בקשו מבעל העסק קישור הזמנה.", "ليس لديك وصول لأي مشروع حالياً. إذا كنت موظفاً، اطلب رابط دعوة من صاحب المشروع.", "You don't have access to any business. If you're staff, ask the owner for an invite link."],
  createBusiness: ["יצירת העסק", "إنشاء المشروع", "Create business"],

  // Invite & join pages
  inviteTitle: ["הצטרפות לצוות של {b}", "الانضمام إلى فريق {b}", "Join the {b} team"],
  inviteIntro: ["קיבלתם הזמנה להצטרף כעובד/ת. צרו חשבון כדי להתחיל.", "تلقيت دعوة للانضمام كموظف. أنشئ حساباً للبدء.", "You've been invited to join as staff. Create an account to start."],
  inviteSignedIn: ["אתם מחוברים בתור {email}. להצטרף לעסק עם החשבון הזה?", "أنت مسجل باسم {email}. الانضمام بهذا الحساب؟", "You're signed in as {email}. Join with this account?"],
  acceptInvite: ["הצטרפות", "انضمام", "Join"],
  joinTitle: ["כרטיס הנאמנות של {b}", "بطاقة الولاء من {b}", "{b} loyalty card"],
  joinIntro: ["ממלאים שם וטלפון ומקבלים כרטיס אישי בטלפון.", "أدخل اسمك وهاتفك واحصل على بطاقة شخصية على هاتفك.", "Enter your name and phone and get a personal card on your phone."],
  terms: ["אני מאשר/ת לעסק לשמור את השם והטלפון שלי לצורך כרטיס הנאמנות.", "أوافق على حفظ اسمي وهاتفي لدى المشروع لغرض بطاقة الولاء.", "I agree that the business may keep my name and phone for the loyalty card."],
  marketing: ["אשמח לקבל עדכונים ומבצעים מהעסק (לא חובה).", "أرغب بتلقي تحديثات وعروض من المشروع (اختياري).", "I'd like to receive updates and offers from the business (optional)."],
  getCard: ["קבלת הכרטיס", "احصل على البطاقة", "Get my card"],
  phoneNotVerified: ["מספר הטלפון לא מאומת ב־SMS.", "رقم الهاتف غير مُتحقق منه برسالة SMS.", "The phone number isn't verified by SMS."],
};

export function translate(lang: Lang, key: string, vars?: Record<string, string | number>): string {
  const entry = words[key];
  let text = entry ? entry[LANGS.indexOf(lang)] : key;
  if (vars) for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{${k}}`, String(v));
  return text;
}

export function errorText(lang: Lang, code: string | undefined): string {
  return code && words["err_" + code] ? translate(lang, "err_" + code) : translate(lang, "err_generic");
}

/** Language choice, remembered on this device, with page direction (RTL/LTR) kept in sync. */
export function useLang() {
  const [lang, setLang] = useState<Lang>("he");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("perkly-language");
      if (saved && LANGS.includes(saved as Lang)) setLang(saved as Lang);
    } catch {}
  }, []);
  useEffect(() => {
    document.documentElement.dir = lang === "en" ? "ltr" : "rtl";
    document.documentElement.lang = lang;
    try {
      localStorage.setItem("perkly-language", lang);
    } catch {}
  }, [lang]);
  const t = (key: string, vars?: Record<string, string | number>) => translate(lang, key, vars);
  return { lang, setLang, t, dir: lang === "en" ? "ltr" : "rtl" } as const;
}
