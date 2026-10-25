const KEY = 'axa_language';
const translations = {
  'Main': 'Meniu principal', 'Services': 'Servicii', 'Packages': 'Pachete', 'How it works': 'Cum funcționează',
  'FAQ': 'Întrebări frecvente', 'Contact': 'Contact', 'Track booking': 'Urmărește rezervarea',
  'Staff portal': 'Portalul personalului', 'Book now': 'Rezervă acum', 'Track my booking': 'Urmărește rezervarea',
  'Book a clean': 'Rezervă o curățenie', 'Home and commercial cleaning': 'Curățenie rezidențială și comercială',
  'Spotless': 'Impecabil', 'homes': 'locuințe', 'offices': 'birouri', 'apartments': 'apartamente', 'villas': 'vile',
  'zero stress.': 'fără stres.', 'Choose a cleaning service, request a date, and share the details that help our team prepare. We’ll review your request and confirm by e-mail.': 'Alege un serviciu de curățenie, solicită o dată și oferă detaliile de care echipa noastră are nevoie. Vom analiza solicitarea și îți vom confirma prin e-mail.',
  'Compare packages': 'Compară pachetele', 'Clear service details': 'Detalii clare despre servicii',
  'Package choices': 'Opțiuni de pachete', 'Requests reviewed by our team': 'Solicitările sunt analizate de echipa noastră',
  'Request received': 'Solicitare primită', 'Our team will review the details': 'Echipa noastră va analiza detaliile',
  'Choose your service': 'Alege serviciul', 'See package details before requesting': 'Consultă detaliile pachetului înainte de solicitare',
  'Updates by e-mail': 'Actualizări prin e-mail', 'Browse service packages': 'Descoperă pachetele de servicii',
  'Review package details': 'Consultă detaliile pachetelor', 'Request a date': 'Solicită o dată',
  'Share your requirements': 'Spune-ne cerințele tale', 'Compare service options': 'Compară opțiunile de servicii',
  'Contact our team': 'Contactează echipa noastră', 'Choose a service': 'Alege un serviciu',
  'Request a time': 'Solicită o oră', 'Team reviews request': 'Echipa analizează solicitarea',
  'Receive an update': 'Primește o actualizare', 'Service options': 'Opțiuni de servicii',
  'Explore the type of service you need': 'Descoperă tipul de serviciu de care ai nevoie',
  'Available services, inclusions, and pricing are shown in the package list.': 'Serviciile disponibile, ce includ și prețurile sunt afișate în lista de pachete.',
  'Home': 'Locuință', 'Office': 'Birou', 'Deep clean': 'Curățenie generală', 'Other needs': 'Alte servicii',
  'Home cleaning for your space': 'Curățenie pentru locuința ta',
  'Choose an available package and tell our team what matters for your home.': 'Alege un pachet disponibil și spune-ne ce este important pentru locuința ta.',
  'Review package details and inclusions': 'Consultă detaliile și serviciile incluse',
  'Share room and property details': 'Oferă detalii despre camere și proprietate',
  'Discuss product preferences in your request': 'Menționează preferințele privind produsele în solicitarea ta',
  'Browse packages': 'Vezi pachetele', 'Cleaning for offices and workplaces': 'Curățenie pentru birouri și spații de lucru',
  'Share your workspace needs and preferred schedule so our team can review the request.': 'Spune-ne de ce are nevoie spațiul tău de lucru și care este programul preferat.',
  'Choose a commercial service package': 'Alege un pachet de servicii comerciale',
  'Describe the spaces that need attention': 'Descrie spațiile care necesită curățenie',
  'Confirm schedule and service details with our team': 'Confirmă programul și detaliile serviciului cu echipa noastră',
  'Deep cleans and move-outs': 'Curățenie generală și la mutare',
  'Review the package inclusions and request any additional services that suit your property.': 'Consultă serviciile incluse și solicită servicii suplimentare potrivite proprietății tale.',
  'See current package inclusions': 'Vezi serviciile incluse în pachetele actuale',
  'Choose available extras': 'Alege servicii suplimentare disponibile',
  'Share move-in or move-out requirements': 'Menționează cerințele pentru mutare',
  'Other cleaning requirements': 'Alte cerințe de curățenie',
  'Review the current packages and extras, then share any specific preferences or sensitivities with our team.': 'Consultă pachetele și serviciile suplimentare, apoi spune-ne preferințele sau sensibilitățile tale.',
  'Share allergy or product concerns': 'Menționează alergiile sau preocupările legate de produse',
  'Confirm product suitability before service': 'Confirmă compatibilitatea produselor înainte de prestarea serviciului',
  'Explore service packages': 'Descoperă pachetele de servicii',
  'Review package details and pricing. Compare up to three packages side by side.': 'Consultă detaliile și prețurile pachetelor. Compară până la trei pachete.',
  'Package category': 'Categorie de pachet', 'Compare all packages': 'Compară toate pachetele',
  'Compare': 'Compară', 'Clear': 'Șterge', 'All': 'Toate', 'MOST POPULAR': 'CEL MAI POPULAR',
  '/ visit': '/ vizită', 'Book this': 'Rezervă', 'Details': 'Detalii',
  'From booking request to confirmation': 'De la solicitarea rezervării la confirmare',
  'Choose a package': 'Alege un pachet', 'Compare package inclusions and any optional extras shown.': 'Compară serviciile incluse și opțiunile suplimentare.',
  'Pick your day': 'Alege o zi', 'See live availability and choose a time that suits you.': 'Verifică disponibilitatea și alege ora potrivită.',
  'Submit your details': 'Trimite detaliile tale', 'Include contact information and notes that help our team review the request.': 'Adaugă datele de contact și notele utile echipei noastre.',
  'Our team will confirm the booking details and any next steps by e-mail.': 'Echipa noastră îți va confirma detaliile rezervării și pașii următori prin e-mail.',
  'Your booking': 'Rezervarea ta', 'A clear request-to-confirmation process': 'Un proces clar, de la solicitare la confirmare',
  'Your selected slot is a request until the team confirms it.': 'Intervalul ales rămâne o solicitare până la confirmarea echipei.',
  'Request first': 'Mai întâi, solicită', 'Package details': 'Detalii despre pachet',
  'Share preferences': 'Spune-ne preferințele tale', 'E-mail updates': 'Actualizări prin e-mail',
  'A submitted date is a request. Our team reviews capacity before confirming a booking.': 'Data trimisă este o solicitare. Echipa noastră verifică disponibilitatea înainte de confirmare.',
  'Review the listed services and extras before selecting a package.': 'Consultă serviciile și opțiunile suplimentare înainte de a alege pachetul.',
  'Use the booking notes to tell our team about access, product or other service needs.': 'Folosește notele rezervării pentru a ne informa despre acces, produse sau alte cerințe.',
  'Booking updates are grouped into the same e-mail conversation.': 'Actualizările rezervării sunt grupate în aceeași conversație prin e-mail.',
  'Good questions': 'Întrebări frecvente', 'How does booking confirmation work?': 'Cum funcționează confirmarea rezervării?',
  'After you request a booking you receive an e-mail with your reference. Our team checks cleaner availability and replies in the same thread to confirm, suggest changes or let you know if we can’t make it.': 'După ce soliciți o rezervare, vei primi un e-mail cu numărul de referință. Echipa verifică disponibilitatea și îți răspunde în aceeași conversație pentru a confirma, propune modificări sau anunța dacă nu poate onora solicitarea.',
  'Can I change or cancel my booking?': 'Pot modifica sau anula rezervarea?',
  'Reply to your booking e-mail or send us a message with your booking reference. Our team will follow up to confirm any change.': 'Răspunde la e-mailul rezervării sau trimite-ne un mesaj cu numărul de referință. Echipa noastră va confirma modificările.',
  'Do I need to provide cleaning products?': 'Trebuie să asigur produsele de curățenie?',
  'Product and equipment arrangements depend on the service. Please add your preferences to the request and confirm them with our team.': 'Produsele și echipamentele depind de serviciu. Menționează preferințele în solicitare și confirmă-le cu echipa noastră.',
  'What should I know before requesting a service?': 'Ce trebuie să știu înainte de a solicita un serviciu?',
  'Review the package inclusions and estimated price, then include any important requirements in your request. Our team will confirm availability and service details before accepting the booking.': 'Consultă serviciile incluse și prețul estimat, apoi menționează cerințele importante în solicitare. Echipa va confirma disponibilitatea și detaliile înainte de acceptarea rezervării.',
  'When do I pay?': 'Când efectuez plata?', 'Payment arrangements will be confirmed by our team before the booking is accepted.': 'Echipa noastră va confirma modalitatea de plată înainte de acceptarea rezervării.',
  'Ready for a spotless space?': 'Vrei un spațiu impecabil?',
  'Send a booking request and our team will follow up to confirm the details.': 'Trimite o solicitare de rezervare, iar echipa noastră te va contacta pentru confirmarea detaliilor.',
  'Book your clean': 'Rezervă serviciul de curățenie', 'Explore the available service packages and contact our team with any questions.': 'Descoperă pachetele de servicii și contactează echipa noastră dacă ai întrebări.',
  'Contact details will be added here.': 'Datele de contact vor fi adăugate aici.', 'Explore': 'Explorează',
  'Track a booking': 'Urmărește o rezervare', 'Send a message': 'Trimite un mesaj', 'Name': 'Nume',
  'E-mail': 'E-mail', 'Phone': 'Telefon', '(optional)': '(opțional)', 'Message': 'Mesaj',
  'Website': 'Site web', 'Send message': 'Trimite mesajul', 'All rights reserved.': 'Toate drepturile rezervate.',
  'Close': 'Închide', 'Compare packages': 'Compară pachetele', 'Package': 'Pachet',
  'Track your booking': 'Urmărește rezervarea', 'Booking reference': 'Numărul rezervării',
  'E-mail used for booking': 'E-mailul folosit la rezervare', 'Check status': 'Verifică starea',
  'Book your clean': 'Rezervă serviciul de curățenie', 'Booking steps': 'Pașii rezervării',
  'Date & time': 'Data și ora', 'Your details': 'Datele tale', 'Confirm': 'Confirmă',
  'Property': 'Proprietate', 'Type': 'Tip', 'Apartment': 'Apartament', 'House': 'Casă', 'Villa': 'Vilă',
  'Studio': 'Garsonieră', 'Other': 'Altul', 'Bedrooms': 'Dormitoare', 'Bathrooms': 'Băi',
  'Extras': 'Servicii suplimentare', '(optional)': '(opțional)', 'Pick a date': 'Alege o dată',
  'Available start times appear here.': 'Orele de începere disponibile vor apărea aici.',
  'Available': 'Disponibil', 'Limited': 'Disponibilitate limitată', 'Fully booked': 'Complet rezervat',
  'Full name': 'Numele complet', 'Street address': 'Adresa străzii', 'City': 'Oraș',
  'Postcode': 'Cod poștal', 'Notes for the team': 'Note pentru echipă',
  '(access, pets, priorities)': '(acces, animale de companie, priorități)',
  '(use an address where the team can contact you)': '(folosește o adresă la care echipa te poate contacta)',
  'I agree that AXA Cleaning may use my details to respond to this booking request. Please do not include sensitive personal information in the notes.': 'Sunt de acord ca AXA Cleaning să folosească datele mele pentru a răspunde solicitării de rezervare. Te rog să nu incluzi informații personale sensibile în note.',
  'Estimate': 'Estimare', 'Back': 'Înapoi', 'Continue': 'Continuă', 'Send booking request': 'Trimite solicitarea de rezervare',
  'Sign in': 'Autentificare', 'Signing in…': 'Se autentifică…', 'Show': 'Arată', 'Hide': 'Ascunde',
  'Username': 'Nume de utilizator', 'Password': 'Parolă', 'Keep me signed in on this device': 'Păstrează-mă autentificat pe acest dispozitiv',
  'Accounts are created by a Manager or Super Admin. Forgot your password? Ask your manager to reset it.': 'Conturile sunt create de un Manager sau Super Admin. Ai uitat parola? Cere managerului să o reseteze.',
  '← Back to website': '← Înapoi la site', 'Dashboard': 'Panou principal', 'Bookings': 'Rezervări',
  'Cleaning agents': 'Personal de curățenie', 'Packages & extras': 'Pachete și servicii suplimentare',
  'Users & roles': 'Utilizatori și roluri', 'Activity log': 'Jurnal de activitate',
  'Contact messages': 'Mesaje de contact', 'Business settings': 'Setări companie', 'My account': 'Contul meu',
  'View website': 'Vezi site-ul', 'Sign out': 'Deconectare', 'New booking': 'Rezervare nouă',
  'Notifications': 'Notificări', 'Mark all read': 'Marchează totul ca citit',
  'Enable desktop alerts': 'Activează notificările desktop', 'Please confirm': 'Te rugăm să confirmi',
  'Confirm': 'Confirmă', 'Cancel': 'Anulează', 'Availability conflict': 'Conflict de disponibilitate',
  'These cleaners are not available:': 'Următorii membri ai personalului nu sunt disponibili:',
  'Reason for overriding this conflict': 'Motivul pentru ignorarea acestui conflict',
  'Override and continue': 'Ignoră conflictul și continuă',
  'Not saved – choose available cleaners or cancel the override.': 'Nu s-a salvat – alege personal disponibil sau anulează ignorarea conflictului.',
  'Availability conflicts can only be overridden by a Manager or Super Admin.': 'Doar un Manager sau Super Admin poate ignora conflictele de disponibilitate.',
  'Session expired': 'Sesiunea a expirat', 'Please set a new password before continuing.': 'Setează o parolă nouă înainte de a continua.',
  'This browser does not support desktop notifications': 'Acest browser nu acceptă notificări desktop',
  'Desktop alerts enabled': 'Notificările desktop sunt activate', 'Desktop alerts were blocked': 'Notificările desktop au fost blocate',
  'You’re all caught up ✨': 'Ai citit toate notificările ✨', 'You can compare up to 3 packages at a time': 'Poți compara cel mult 3 pachete simultan',
  'No packages are available to compare yet.': 'Nu există încă pachete disponibile pentru comparare.',
  'Service packages are currently unavailable. Please try again later.': 'Pachetele de servicii nu sunt disponibile momentan. Încearcă din nou mai târziu.',
  'Booking is unavailable while service packages are not configured.': 'Rezervarea nu este disponibilă până la configurarea pachetelor de servicii.',
  'Please choose a package': 'Alege un pachet', 'Please pick a date and a start time': 'Alege o dată și o oră de începere',
  'All packages': 'Toate pachetele', 'Your selection': 'Selecția ta', 'Price': 'Preț', 'Duration': 'Durată',
  'Team size': 'Dimensiunea echipei', 'Category': 'Categorie', 'Included': 'Inclus', 'Not included': 'Neincluse',
  'Nothing — it’s all in': 'Nimic — totul este inclus', 'Review': 'Verifică', 'Accept & assign': 'Acceptă și alocă',
  'Modify': 'Modifică', 'Mark completed': 'Marchează ca finalizată', 'Reject': 'Respinge',
  'Cancel booking': 'Anulează rezervarea', 'Re-open': 'Redeschide', 'E-mail customer': 'Trimite e-mail clientului',
  'Customer': 'Client', 'When': 'Când', 'Cleaners': 'Personal', 'Status': 'Stare', 'Ref': 'Referință',
  'Not assigned': 'Nealocat', 'recommended': 'recomandat', 'Customer notes': 'Notele clientului',
  'Internal notes': 'Note interne', 'Source': 'Sursă', 'E-mail thread': 'Conversație prin e-mail',
  'History': 'Istoric', 'Show message': 'Afișează mesajul', 'Hide message': 'Ascunde mesajul',
  'No e-mails yet.': 'Nu există încă e-mailuri.', 'Loading…': 'Se încarcă…',
  'Cleaning agents': 'Personal de curățenie', 'Auto-pick free': 'Selectează automat personalul disponibil',
  'Choose a date and start time to see who is free.': 'Alege o dată și o oră pentru a vedea cine este disponibil.',
  'No bookings match these filters.': 'Nicio rezervare nu corespunde acestor filtre.',
  'No pending requests 🎉': 'Nu există solicitări în așteptare 🎉', 'Nothing scheduled': 'Nu este programat nimic',
  'Pending requests': 'Solicitări în așteptare', 'Jobs today': 'Lucrări de astăzi',
  'Agents free today': 'Personal disponibil astăzi', 'Booked this month': 'Rezervări luna aceasta',
  'Completed jobs': 'Lucrări finalizate', 'Cleaning agent availability': 'Disponibilitatea personalului',
  'Today': 'Astăzi', '7 days': '7 zile', '14 days': '14 zile', '3 days': '3 zile',
  'Partly booked': 'Parțial ocupat', 'On leave': 'În concediu', 'Day off': 'Zi liberă',
  'Pending (tentative)': 'În așteptare (provizoriu)', 'Booking requests awaiting review': 'Solicitări de rezervare în curs de verificare',
  'View all': 'Vezi tot', 'Next 7 days': 'Următoarele 7 zile', 'Requests – last 14 days': 'Solicitări – ultimele 14 zile',
  'Bookings by package': 'Rezervări după pachet', 'All statuses': 'Toate stările', 'Search bookings': 'Caută rezervări',
  'From': 'De la', 'To': 'Până la', 'Sort by': 'Sortează după', 'Newest': 'Cele mai noi',
  'Date': 'Dată', 'New': 'Nouă', 'Pending': 'În așteptare', 'Accepted': 'Acceptată',
  'Rejected': 'Respinsă', 'Completed': 'Finalizată', 'Cancelled': 'Anulată', 'Active': 'Activ',
  'Disabled': 'Dezactivat', 'Never': 'Niciodată', 'Edit': 'Editează', 'Delete': 'Șterge',
  'Protected': 'Protejat', 'Only a Super Admin can manage this account': 'Doar un Super Admin poate gestiona acest cont',
  'Only a Super Admin can issue reset codes.': 'Doar un Super Admin poate emite coduri de resetare.',
  'Add user': 'Adaugă utilizator', 'Add staff user': 'Adaugă utilizator', 'Add package': 'Adaugă pachet',
  'Edit extras': 'Editează serviciile suplimentare', 'Add extra': 'Adaugă serviciu suplimentar',
  'Remove': 'Elimină', 'Save': 'Salvează', 'Save extras': 'Salvează serviciile suplimentare',
  'Package saved': 'Pachetul a fost salvat', 'Extras saved': 'Serviciile suplimentare au fost salvate',
  'Delete account': 'Șterge contul', 'Account deleted': 'Contul a fost șters',
  'Full name': 'Numele complet', 'Role': 'Rol', 'Contact': 'Contact', 'Last sign-in': 'Ultima autentificare',
  'Created': 'Creat', 'You': 'Tu', 'must change password': 'trebuie să schimbe parola',
  'staff accounts': 'conturi de personal', 'staff account': 'cont de personal',
  'When': 'Când', 'Action': 'Acțiune', 'Details': 'Detalii', 'messages': 'mesaje',
  'Super Admin': 'Super Admin', 'Manager': 'Manager', 'Admin': 'Admin',
  'pending': 'în așteptare', 'accepted': 'acceptată', 'rejected': 'respinsă',
  'completed': 'finalizată', 'cancelled': 'anulată', 'new': 'nou', 'read': 'citit', 'closed': 'închis',
  'Free': 'Disponibil', 'Booked': 'Ocupat', 'Leave': 'Concediu', 'Off': 'Liber',
  'Agent': 'Personal', 'No active cleaning agents yet.': 'Nu există încă personal activ.',
  'No active agents.': 'Nu există personal activ.', 'No data yet': 'Nu există încă date',
  'All statuses': 'Toate stările', 'Search ref, customer, e-mail, phone, city…': 'Caută referință, client, e-mail, telefon, oraș…',
  'From date': 'De la data', 'To date': 'Până la data', 'Newest requests': 'Cele mai noi solicitări',
  'Service date': 'Data serviciului', 'Previous': 'Anterior', 'Next': 'Următorul',
  'Availability': 'Disponibilitate', 'Agent availability': 'Disponibilitatea personalului',
  'free': 'disponibil', 'busy': 'ocupat', 'Booked': 'Ocupat',
  'Choose a date and start time to see who is free.': 'Alege o dată și o oră pentru a vedea cine este disponibil.',
  'Few left': 'Puține locuri', 'No start times fit this package on this day.': 'Nu există ore de începere potrivite pentru acest pachet în această zi.',
  'Checking availability…': 'Se verifică disponibilitatea…', 'Booked': 'Rezervat',
  'Select at least one cleaning agent': 'Selectează cel puțin un membru al personalului',
  'Message to customer': 'Mesaj pentru client', '(optional, added to the confirmation e-mail)': '(opțional, se adaugă la e-mailul de confirmare)',
  'e.g. Our team will call 30 minutes before arrival.': 'de ex. Echipa noastră va suna cu 30 de minute înainte de sosire.',
  'Accept & e-mail customer': 'Acceptă și trimite e-mail clientului',
  'Reason (sent to the customer)': 'Motiv (trimis clientului)',
  'e.g. Unfortunately no team is available on this date. Could you choose another day?': 'de ex. Din păcate, nu avem o echipă disponibilă la această dată. Poți alege o altă zi?',
  'Reject & e-mail customer': 'Respinge și trimite e-mail clientului',
  'Mark as completed': 'Marchează ca finalizată', 'Re-open booking': 'Redeschide rezervarea',
  'Message to customer (optional)': 'Mesaj pentru client (opțional)',
  'E-mail the customer in the booking thread': 'Trimite e-mail clientului în conversația rezervării',
  'Sent as a reply in the existing booking thread to': 'Trimis ca răspuns în conversația existentă la',
  '(company mailbox in CC).': '(adresa companiei este în CC).',
  'Create booking': 'Creează rezervarea', 'Modify booking': 'Modifică rezervarea',
  'Service': 'Serviciu', 'Customer': 'Client', 'Start time': 'Ora de începere',
  'Price (blank = auto)': 'Preț (gol = automat)', 'Property': 'Proprietate',
  'Send booking request': 'Trimite solicitarea de rezervare', 'Create user': 'Creează utilizator',
  'Account active': 'Cont activ', 'A one-time sign-in code will be displayed after account creation. Share it securely; it expires in 10 minutes and requires a password change at first sign-in.': 'După crearea contului va fi afișat un cod unic de autentificare. Distribuie-l în siguranță; expiră în 10 minute și necesită schimbarea parolei la prima autentificare.',
  'As Super Admin you can manage every account.': 'În calitate de Super Admin, poți gestiona toate conturile.',
  'Managers can create and manage Manager and Admin accounts. Super Admin accounts are protected.': 'Managerii pot crea și gestiona conturi Manager și Admin. Conturile Super Admin sunt protejate.',
  'This signs the user out on all devices and invalidates their current password. A one-time code expires in 10 minutes, can be used once, and requires a new password at sign-in.': 'Această acțiune deconectează utilizatorul de pe toate dispozitivele și invalidează parola curentă. Codul unic expiră în 10 minute, poate fi folosit o singură dată și necesită o parolă nouă la autentificare.',
  'Issue one-time code': 'Emite codul unic', 'Reset code issued': 'Codul de resetare a fost emis',
  'Give this one-time sign-in code to': 'Oferă acest cod unic de autentificare',
  'using a secure channel. It is shown only once, expires': 'printr-un canal sigur. Este afișat o singură dată, expiră',
  'and requires a new password at first sign-in.': 'și necesită o parolă nouă la prima autentificare.',
  'Code copied': 'Codul a fost copiat', 'Could not copy the code; select and copy it manually': 'Codul nu a putut fi copiat; selectează-l și copiază-l manual',
  'Users': 'Utilizatori', 'Accounts': 'Conturi', 'Contact messages': 'Mesaje de contact',
  'Reply by e-mail': 'Răspunde prin e-mail', 'Close': 'Închide',
  'No contact messages yet.': 'Nu există încă mesaje de contact.',
  'No activity yet': 'Nu există încă activitate', 'Business settings saved': 'Setările companiei au fost salvate',
  'These settings control the public contact details, currency, and business timezone. Resend credentials are deliberately kept in Supabase function secrets, never in the browser or database.': 'Aceste setări controlează datele publice de contact, moneda și fusul orar al companiei. Datele Resend sunt păstrate în secretele funcției Supabase, niciodată în browser sau baza de date.',
  'Change password': 'Schimbă parola', 'Profile': 'Profil',
  'Your one-time sign-in code has been used. Choose a new password to finish signing in.': 'Codul unic de autentificare a fost folosit. Alege o parolă nouă pentru a finaliza autentificarea.',
  '(8+ characters, letters and numbers)': '(cel puțin 8 caractere, litere și cifre)',
  'New passwords do not match': 'Parolele noi nu coincid', 'Password updated': 'Parola a fost actualizată',
  'User updated': 'Utilizatorul a fost actualizat', 'User @': 'Utilizatorul @',
  'No pending requests': 'Nu există solicitări în așteptare',
  'Bookings are hidden from public availability until confirmed.': 'Rezervările nu sunt afișate public până la confirmare.',
  'Sign-in code': 'Cod de autentificare',
  'AXA Cleaning · Cleaning services and booking requests': 'AXA Cleaning · Servicii de curățenie și solicitări de rezervare',
  'Explore AXA Cleaning service packages, send a booking request, or contact the team.': 'Descoperă pachetele AXA Cleaning, trimite o solicitare de rezervare sau contactează echipa.',
  'Staff sign in · AXA Cleaning': 'Autentificare personal · AXA Cleaning',
  'Portal · AXA Cleaning': 'Portal · AXA Cleaning',
  'Page not found · AXA Cleaning': 'Pagina nu a fost găsită · AXA Cleaning',
  'Page not found': 'Pagina nu a fost găsită',
  'Looks like this page got cleaned away.': 'Se pare că această pagină a fost curățată.',
  'Back to home': 'Înapoi la pagina principală',
  'Language': 'Limbă',
  'visit': 'vizită', 'Arrival': 'Sosire', 'Book': 'Rezervă',
  'Romanian name': 'Denumire în română', 'Romanian category': 'Categorie în română',
  'Romanian tagline': 'Descriere scurtă în română',
  'Included features (Romanian)': 'Servicii incluse (română)',
  'Not included (Romanian)': 'Servicii neincluse (română)',
  '(optional)': '(opțional)', 'The Romanian translations are optional; English is used when left blank.': 'Traducerile în română sunt opționale; se folosește engleza dacă sunt lăsate necompletate.',
  'All': 'Toate', 'No extras available.': 'Nu există servicii suplimentare disponibile.',
  'You can compare up to 3 packages at a time': 'Poți compara cel mult 3 pachete simultan',
  'No packages are available to compare yet.': 'Nu există încă pachete disponibile pentru comparare.',
  'No service packages are available yet.': 'Nu există încă pachete de servicii disponibile.',
  'One-time reset code': 'Cod unic de resetare',
  'Choose a cleaning package': 'Alege un pachet de curățenie', 'Specialty': 'Specializat',
  'Commercial': 'Comercial', 'Most popular': 'Cel mai popular',
  'Request received, but automatic e-mail delivery failed. Our team can still see your request.': 'Solicitarea a fost primită, dar trimiterea automată a e-mailului a eșuat. Echipa noastră poate vedea solicitarea.',
  'Message received, but automatic e-mail delivery failed. Our team can still see your message.': 'Mesajul a fost primit, dar trimiterea automată a e-mailului a eșuat. Echipa noastră poate vedea mesajul.',
  'Message received. Automatic e-mail delivery is not configured yet.': 'Mesajul a fost primit. Trimiterea automată a e-mailurilor nu este configurată încă.',
  'A receipt was e-mailed to': 'Confirmarea a fost trimisă prin e-mail la',
  'Looking up…': 'Se caută…', 'Sending…': 'Se trimite…',
  'Could not load availability:': 'Disponibilitatea nu a putut fi încărcată:',
  'No extras available.': 'Nu există servicii suplimentare disponibile.',
  'This is a booking': 'Aceasta este o solicitare de rezervare',
  'request': 'solicitare', 'not a confirmation.': 'nu o confirmare.',
  'Our team will review availability and contact you at the e-mail address provided': 'Echipa noastră va verifica disponibilitatea și te va contacta la adresa de e-mail furnizată',
  'Request received': 'Solicitare primită', 'Your booking reference is': 'Numărul de referință al rezervării este',
  'track your booking': 'urmărește rezervarea', 'Check status': 'Verifică starea',
  'Reference': 'Referință', 'Estimated total': 'Total estimat', 'Bedrooms': 'Dormitoare',
  'Bathrooms': 'Băi', 'Select a time': 'Alege o oră', 'Fully booked': 'Complet rezervat',
  'Previous month': 'Luna precedentă', 'Next month': 'Luna următoare',
  'Search': 'Caută', 'No availability': 'Nu există disponibilitate',
  'No packages are available to compare yet.': 'Nu există încă pachete disponibile pentru comparare.',
  'Most popular': 'Cel mai popular', 'Request received': 'Solicitare primită',
  'Role': 'Rol', 'Super Admin': 'Super Admin', 'Admin': 'Administrator',
  'Please enter a reason': 'Introdu un motiv', 'Reason': 'Motiv',
  'Add booking': 'Adaugă rezervare', 'Create booking': 'Creează rezervarea',
  'Booking saved': 'Rezervarea a fost salvată', 'Changes saved': 'Modificările au fost salvate',
  'Booking updated': 'Rezervarea a fost actualizată', 'Booking accepted': 'Rezervarea a fost acceptată',
  'Booking rejected': 'Rezervarea a fost respinsă', 'Booking completed': 'Rezervarea a fost finalizată',
  'Booking cancelled': 'Rezervarea a fost anulată', 'Booking re-opened': 'Rezervarea a fost redeschisă',
  'Please confirm': 'Te rugăm să confirmi', 'Confirm action': 'Confirmă acțiunea',
  'No contact messages yet.': 'Nu există încă mesaje de contact.',
  'No activity yet.': 'Nu există încă activitate.', 'No users found.': 'Nu au fost găsiți utilizatori.',
  'Add user': 'Adaugă utilizator', 'Add package': 'Adaugă pachet',
  'Search users': 'Caută utilizatori', 'Search messages': 'Caută mesaje',
  'Mark as read': 'Marchează ca citit', 'Close message': 'Închide mesajul',
  'Reply': 'Răspunde', 'Send reply': 'Trimite răspunsul',
  'Company name': 'Numele companiei', 'Company e-mail': 'E-mailul companiei',
  'Public phone': 'Telefon public', 'Service area': 'Zona de servicii',
  'Currency': 'Monedă', 'Timezone': 'Fus orar', 'Save settings': 'Salvează setările',
  'Business profile saved': 'Profilul companiei a fost salvat',
  'Current password': 'Parola actuală', 'New password': 'Parola nouă',
  'Confirm new password': 'Confirmă parola nouă', 'Change password': 'Schimbă parola',
  'Password changed': 'Parola a fost schimbată', 'Update password': 'Actualizează parola',
  'The passwords do not match': 'Parolele nu coincid',
  'Please enter your current password': 'Introdu parola actuală',
  'Select all': 'Selectează tot', 'Select cleaners': 'Selectează personalul',
  'All agents': 'Tot personalul', 'No agents available': 'Nu există personal disponibil',
  'Working days': 'Zile lucrătoare', 'Leave dates': 'Datele concediului',
  'Add leave': 'Adaugă concediu', 'Remove leave': 'Elimină concediul',
  'Save changes': 'Salvează modificările', 'Agent saved': 'Membrul personalului a fost salvat',
  'Package name': 'Numele pachetului', 'Category': 'Categorie', 'Tagline': 'Descriere scurtă',
  'Price': 'Preț', 'Duration (h)': 'Durată (ore)', 'Cleaners needed': 'Număr de persoane necesare',
  'Included features': 'Servicii incluse', 'Not included': 'Servicii neincluse',
  '(one per line)': '(unul pe rând)', 'Highlight as "Most popular"': 'Evidențiază ca „Cel mai popular”',
  'Show on website': 'Afișează pe site', 'Display order': 'Ordinea afișării', 'Colour': 'Culoare',
  'Icon': 'Pictogramă', 'Edit package': 'Editează pachetul', 'Package archived': 'Pachet arhivat',
  'Issue one-time reset code': 'Emite un cod unic de resetare',
  'Issue reset code': 'Emite codul de resetare', 'Reset password': 'Resetează parola',
  'Delete the account': 'Șterge contul', 'This cannot be undone.': 'Această acțiune nu poate fi anulată.',
  'One-time code': 'Cod de unică folosință', 'Copy code': 'Copiază codul',
  'The code is shown only once.': 'Codul este afișat o singură dată.',
  'Please confirm the booking details': 'Confirmă detaliile rezervării',
  'Not available': 'Indisponibil', 'Free': 'Disponibil', 'Busy': 'Ocupat',
  'Requests last 14 days': 'Solicitări în ultimele 14 zile',
  'Account is already': 'Contul este deja', 'Request failed': 'Solicitarea a eșuat',
  'Invalid submission': 'Trimitere invalidă', 'Thank you. Your message has been received.': 'Mulțumim. Mesajul tău a fost primit.',
  'Something went wrong on our side. Please try again.': 'A apărut o problemă. Te rugăm să încerci din nou.',
};

const originalText = new WeakMap();
const originalAttrs = new WeakMap();
export function getLanguage() {
  const saved = localStorage.getItem(KEY);
  return saved === 'ro' || saved === 'en' ? saved : (navigator.language?.toLowerCase().startsWith('ro') ? 'ro' : 'en');
}
export function t(value) {
  if (getLanguage() !== 'ro') return value;
  if (translations[value]) return translations[value];
  let match = /^(\d+) staff accounts?$/.exec(value);
  if (match) return `${match[1]} ${+match[1] === 1 ? 'cont de personal' : 'conturi de personal'}`;
  match = /^(\d+) messages?$/.exec(value);
  if (match) return `${match[1]} ${+match[1] === 1 ? 'mesaj' : 'mesaje'}`;
  match = /^(\d+) min ago$/.exec(value);
  if (match) return `acum ${match[1]} min`;
  match = /^(\d+) h ago$/.exec(value);
  if (match) return `acum ${match[1]} h`;
  match = /^(\d+) d ago$/.exec(value);
  if (match) return `acum ${match[1]} zile`;
  match = /^(\d+) needed$/.exec(value);
  if (match) return `${match[1]} ${+match[1] === 1 ? 'persoană necesară' : 'persoane necesare'}`;
  match = /^Request failed \((\d+)\)$/.exec(value);
  if (match) return `Solicitarea a eșuat (${match[1]})`;
  return value;
}

function translateNode(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    if (!originalText.has(node)) originalText.set(node, node.nodeValue);
    const source = originalText.get(node);
    const trimmed = source.trim();
    if (!trimmed) return;
    const translated = t(trimmed);
    if (translated !== trimmed) node.nodeValue = source.replace(trimmed, translated);
    else if (getLanguage() === 'en' && node.nodeValue !== source) node.nodeValue = source;
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  for (const attr of ['placeholder', 'title', 'aria-label', 'alt', 'content']) {
    if (!node.hasAttribute(attr)) continue;
    let attrs = originalAttrs.get(node);
    if (!attrs) { attrs = {}; originalAttrs.set(node, attrs); }
    if (!(attr in attrs)) attrs[attr] = node.getAttribute(attr);
    const translated = t(attrs[attr]);
    if (node.getAttribute(attr) !== translated) node.setAttribute(attr, translated);
  }
  for (const child of node.childNodes) translateNode(child);
}

export function initLanguage() {
  const language = getLanguage();
  document.documentElement.lang = language;
  document.querySelectorAll('[data-language-select]').forEach((select) => {
    select.value = language;
    if (!select.dataset.languageBound) {
      select.dataset.languageBound = 'true';
      select.addEventListener('change', () => {
        localStorage.setItem(KEY, select.value === 'ro' ? 'ro' : 'en');
        initLanguage();
        dispatchEvent(new CustomEvent('axa-language-change', { detail: { language: getLanguage() } }));
      });
    }
  });
  translateNode(document.documentElement);
  if (!window.__axaI18nObserver) {
    window.__axaI18nObserver = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === 'childList') record.addedNodes.forEach(translateNode);
        else if (record.type === 'attributes') translateNode(record.target);
      }
    });
    window.__axaI18nObserver.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['placeholder', 'title', 'aria-label', 'alt', 'content'] });
  }
}

initLanguage();
