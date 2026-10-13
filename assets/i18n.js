/* Language layer for the player app. Eight languages; the choice is shared with the website (localStorage pv.lang).
   Mark up with data-i18n="key" for text, data-i18n-attr="placeholder:key" for attributes. */
window.r2i18n = (function(){
  "use strict";

  var LANGS = [
    {id:"en", label:"English",    short:"EN"},
    {id:"es", label:"Español",    short:"ES"},
    {id:"pt", label:"Português",  short:"PT"},
    {id:"it", label:"Italiano",   short:"IT"},
    {id:"fr", label:"Français",   short:"FR"},
    {id:"de", label:"Deutsch",    short:"DE"},
    {id:"nl", label:"Nederlands", short:"NL"},
    {id:"sv", label:"Svenska",    short:"SV"}
  ];

  var STR = {
    "nav.dash": {en:"Dashboard", es:"Resumen", pt:"Painel", it:"Dashboard", fr:"Tableau de bord", de:"Dashboard", nl:"Dashboard", sv:"Översikt"},
    "nav.schedule": {en:"Schedule", es:"Agenda", pt:"Agenda", it:"Calendario", fr:"Planning", de:"Trainingsplan", nl:"Schema", sv:"Schema"},
    "nav.dev": {en:"Development", es:"Desarrollo", pt:"Evolução", it:"Crescita", fr:"Progression", de:"Entwicklung", nl:"Ontwikkeling", sv:"Utveckling"},
    "nav.pts": {en:"Points", es:"Puntos", pt:"Pontos", it:"Punti", fr:"Points", de:"Punkte", nl:"Punten", sv:"Poäng"},
    "nav.home": {en:"Home training", es:"Entreno en casa", pt:"Treino em casa", it:"Allenamento a casa", fr:"Entraînement maison", de:"Heimtraining", nl:"Thuistraining", sv:"Hemmaträning"},
    "nav.squad": {en:"Group", es:"Grupo", pt:"Grupo", it:"Gruppo", fr:"Groupe", de:"Gruppe", nl:"Groep", sv:"Grupp"},
    "nav.coach": {en:"Coaches", es:"Entrenadores", pt:"Treinadores", it:"Coach", fr:"Coachs", de:"Coaches", nl:"Trainers", sv:"Tränare"},
    "nav.staff": {en:"Coach tools", es:"Panel coach", pt:"Ferramentas do treinador", it:"Strumenti coach", fr:"Outils coach", de:"Coach-Tools", nl:"Trainerstools", sv:"Tränarverktyg"},
    "nav.bar": {en:"Bar staff", es:"Personal del bar", pt:"Balcão", it:"Staff bar", fr:"Équipe du bar", de:"Bar-Team", nl:"Barpersoneel", sv:"Barpersonal"},
    "short.dash": {en:"Home", es:"Inicio", pt:"Início", it:"Home", fr:"Accueil", de:"Start", nl:"Home", sv:"Hem"},
    "short.schedule": {en:"Agenda", es:"Agenda", pt:"Agenda", it:"Agenda", fr:"Agenda", de:"Plan", nl:"Agenda", sv:"Schema"},
    "short.dev": {en:"Stats", es:"Stats", pt:"Evolução", it:"Stats", fr:"Stats", de:"Stats", nl:"Stats", sv:"Statistik"},
    "short.pts": {en:"Points", es:"Puntos", pt:"Pontos", it:"Punti", fr:"Points", de:"Punkte", nl:"Punten", sv:"Poäng"},
    "short.home": {en:"Training", es:"Entreno", pt:"Treino", it:"Esercizi", fr:"Training", de:"Training", nl:"Training", sv:"Träning"},
    "short.squad": {en:"Group", es:"Grupo", pt:"Grupo", it:"Gruppo", fr:"Groupe", de:"Gruppe", nl:"Groep", sv:"Grupp"},
    "short.coach": {en:"Coaches", es:"Coaches", pt:"Técnicos", it:"Coach", fr:"Coachs", de:"Coaches", nl:"Trainers", sv:"Tränare"},
    "c.confirm": {en:"Confirm", es:"Confirmar", pt:"Confirmar", it:"Conferma", fr:"Confirmer", de:"Bestätigen", nl:"Bevestigen", sv:"Bekräfta"},
    "c.cancel": {en:"Cancel", es:"Cancelar", pt:"Cancelar", it:"Annulla", fr:"Annuler", de:"Abbrechen", nl:"Annuleren", sv:"Avbryt"},
    "c.close": {en:"Close", es:"Cerrar", pt:"Fechar", it:"Chiudi", fr:"Fermer", de:"Schließen", nl:"Sluiten", sv:"Stäng"},
    "c.save": {en:"Save", es:"Guardar", pt:"Guardar", it:"Salva", fr:"Enregistrer", de:"Speichern", nl:"Opslaan", sv:"Spara"},
    "c.all": {en:"All", es:"Todo", pt:"Todos", it:"Tutti", fr:"Tous", de:"Alle", nl:"Alles", sv:"Alla"},
    "c.more": {en:"More", es:"Mas", pt:"Mais", it:"Altro", fr:"Plus", de:"Mehr", nl:"Meer", sv:"Mer"},
    "v.seeShot": {en:"See the shot", es:"Ver el golpe", pt:"Ver o golpe", it:"Vedi il colpo", fr:"Voir le coup", de:"Schlag ansehen", nl:"Bekijk de slag", sv:"Se slaget"},
    "c.goTo": {en:"Go to", es:"Ir a", pt:"Ir para", it:"Vai a", fr:"Aller à", de:"Gehe zu", nl:"Ga naar", sv:"Gå till"},
    "c.today": {en:"Today", es:"Hoy", pt:"Hoje", it:"Oggi", fr:"Aujourd'hui", de:"Heute", nl:"Vandaag", sv:"Idag"},
    "c.points": {en:"points", es:"puntos", pt:"pontos", it:"punti", fr:"points", de:"Punkte", nl:"punten", sv:"poäng"},
    "c.pts": {en:"pts", es:"pts", pt:"pts", it:"pt", fr:"pts", de:"Pkt.", nl:"ptn", sv:"p"},
    "c.signedIn": {en:"Signed in with Google", es:"Sesion con Google", pt:"Sessão iniciada com Google", it:"Accesso con Google", fr:"Connecté avec Google", de:"Angemeldet mit Google", nl:"Ingelogd met Google", sv:"Inloggad med Google"},
    "c.signOut": {en:"Sign out", es:"Salir", pt:"Sair", it:"Esci", fr:"Déconnexion", de:"Abmelden", nl:"Uitloggen", sv:"Logga ut"},
    "c.viewAs": {en:"View as", es:"Ver como", pt:"Ver como", it:"Vedi come", fr:"Voir en tant que", de:"Ansicht als", nl:"Bekijk als", sv:"Visa som"},
    "c.player": {en:"Player", es:"Jugador", pt:"Jogador", it:"Giocatore", fr:"Joueur", de:"Spieler", nl:"Speler", sv:"Spelare"},
    "c.coach": {en:"Coach", es:"Coach", pt:"Treinador", it:"Coach", fr:"Coach", de:"Coach", nl:"Trainer", sv:"Tränare"},
    "c.bar": {en:"Bar", es:"Bar", pt:"Bar", it:"Bar", fr:"Bar", de:"Bar", nl:"Bar", sv:"Bar"},
    "c.offline": {en:"Offline. Your progress is saved on this phone and syncs later.", es:"Sin conexion. Tu progreso queda guardado en este telefono.", pt:"Sem conexão. Seu progresso fica guardado neste aparelho e sincroniza depois.", it:"Offline. I tuoi progressi sono salvati sul telefono e si sincronizzano dopo.", fr:"Hors ligne. Ta progression est enregistrée sur ce téléphone et se synchronisera plus tard.", de:"Offline. Dein Fortschritt ist auf dem Handy gespeichert und wird später synchronisiert.", nl:"Offline. Je voortgang staat op deze telefoon en synct later.", sv:"Offline. Dina framsteg sparas i mobilen och synkas senare."},
    "d.greeting": {en:"Welcome back", es:"Bienvenido", pt:"Bem-vindo de volta", it:"Bentornato", fr:"Content de te revoir", de:"Willkommen zurück", nl:"Welkom terug", sv:"Välkommen tillbaka"},
    "d.next": {en:"Next session", es:"Proxima sesion", pt:"Próxima sessão", it:"Prossima sessione", fr:"Prochaine séance", de:"Nächste Einheit", nl:"Volgende training", sv:"Nästa pass"},
    "d.cant": {en:"Can't make it", es:"No puedo", pt:"Não posso ir", it:"Non posso venire", fr:"Je ne peux pas venir", de:"Ich kann nicht", nl:"Ik kan niet", sv:"Kan inte komma"},
    "d.rating": {en:"Level", es:"Nivel", pt:"Nível", it:"Livello", fr:"Niveau", de:"Level", nl:"Niveau", sv:"Nivå"},
    "d.sessions": {en:"Sessions", es:"Sesiones", pt:"Sessões", it:"Sessioni", fr:"Séances", de:"Einheiten", nl:"Trainingen", sv:"Pass"},
    "d.streak": {en:"Streak", es:"Racha", pt:"Sequência", it:"Serie", fr:"Série", de:"Serie", nl:"Reeks", sv:"Svit"},
    "d.thisSeason": {en:"this season", es:"esta temporada", pt:"nesta temporada", it:"questa stagione", fr:"cette saison", de:"diese Saison", nl:"dit seizoen", sv:"denna säsong"},
    "d.inRow": {en:"in a row", es:"seguidas", pt:"seguidas", it:"di fila", fr:"d'affilée", de:"in Folge", nl:"op rij", sv:"i rad"},
    "d.best": {en:"Best", es:"Mejor", pt:"Melhor", it:"Record", fr:"Record", de:"Bestwert", nl:"Beste", sv:"Bästa"},
    "d.attendance": {en:"Attendance, last 12 weeks", es:"Asistencia, 12 semanas", pt:"Presença, últimas 12 semanas", it:"Presenze, ultime 12 settimane", fr:"Présence, 12 dernières semaines", de:"Anwesenheit, letzte 12 Wochen", nl:"Aanwezigheid, laatste 12 weken", sv:"Närvaro, senaste 12 veckorna"},
    "d.activity": {en:"Recent activity", es:"Actividad reciente", pt:"Atividade recente", it:"Attività recenti", fr:"Activité récente", de:"Letzte Aktivität", nl:"Recente activiteit", sv:"Senaste aktivitet"},
    "d.goal": {en:"Week goal", es:"Meta semanal", pt:"Meta da semana", it:"Obiettivo settimana", fr:"Objectif de la semaine", de:"Wochenziel", nl:"Weekdoel", sv:"Veckans mål"},
    "d.goalSub": {en:"2 training sessions and 1 home drill", es:"2 sesiones y 1 drill en casa", pt:"2 treinos e 1 exercício em casa", it:"2 allenamenti e 1 esercizio a casa", fr:"2 entraînements et 1 exercice à la maison", de:"2 Trainingseinheiten und 1 Heimübung", nl:"2 trainingen en 1 thuisoefening", sv:"2 träningspass och 1 hemmaövning"},
    "s.title": {en:"Your schedule", es:"Tu agenda", pt:"Sua agenda", it:"Il tuo calendario", fr:"Ton planning", de:"Dein Trainingsplan", nl:"Jouw schema", sv:"Ditt schema"},
    "s.sub": {en:"Say yes or no and your coach sees it straight away.", es:"Di si o no y tu coach lo ve al instante.", pt:"Diga sim ou não e seu treinador vê na hora.", it:"Rispondi sì o no e il tuo coach lo vede subito.", fr:"Réponds oui ou non, ton coach le voit tout de suite.", de:"Sag zu oder ab, dein Coach sieht es sofort.", nl:"Zeg ja of nee en je trainer ziet het meteen.", sv:"Svara ja eller nej så ser tränaren det direkt."},
    "s.going": {en:"Going", es:"Voy", pt:"Vou", it:"Ci sono", fr:"J'y vais", de:"Dabei", nl:"Ik kom", sv:"Kommer"},
    "s.notGoing": {en:"Not going", es:"No voy", pt:"Não vou", it:"Non ci sono", fr:"Absent", de:"Nicht dabei", nl:"Ik kom niet", sv:"Kommer inte"},
    "s.spots": {en:"spots left", es:"lugares libres", pt:"vagas", it:"posti liberi", fr:"places restantes", de:"Plätze frei", nl:"plekken vrij", sv:"platser kvar"},
    "s.full": {en:"Full", es:"Lleno", pt:"Lotado", it:"Pieno", fr:"Complet", de:"Voll", nl:"Vol", sv:"Fullt"},
    "s.cal": {en:"Add to calendar", es:"Anadir al calendario", pt:"Adicionar ao calendário", it:"Aggiungi al calendario", fr:"Ajouter au calendrier", de:"Zum Kalender", nl:"Zet in agenda", sv:"Lägg till i kalendern"},
    "v.title": {en:"Player development", es:"Desarrollo del jugador", pt:"Evolução do jogador", it:"Crescita del giocatore", fr:"Ta progression", de:"Spielerentwicklung", nl:"Spelersontwikkeling", sv:"Spelarutveckling"},
    "v.profile": {en:"Skill profile", es:"Perfil tecnico", pt:"Perfil técnico", it:"Profilo tecnico", fr:"Profil technique", de:"Skill-Profil", nl:"Skillprofiel", sv:"Färdighetsprofil"},
    "v.hex": {en:"Hexagon", es:"Hexagono", pt:"Hexágono", it:"Esagono", fr:"Hexagone", de:"Hexagon", nl:"Zeshoek", sv:"Hexagon"},
    "v.body": {en:"Body map", es:"Mapa del cuerpo", pt:"Mapa corporal", it:"Mappa del corpo", fr:"Carte du corps", de:"Körperkarte", nl:"Lichaamskaart", sv:"Kroppskarta"},
    "v.notes": {en:"Coach notes", es:"Notas del coach", pt:"Notas do treinador", it:"Note del coach", fr:"Notes du coach", de:"Coach-Notizen", nl:"Trainersnotities", sv:"Tränarens anteckningar"},
    "v.skills": {en:"Skills, scored out of 10", es:"Tecnica, sobre 10", pt:"Técnica, nota de 0 a 10", it:"Colpi, voto su 10", fr:"Coups, notés sur 10", de:"Skills, bewertet bis 10", nl:"Skills, gescoord op 10", sv:"Färdigheter, betyg av 10"},
    "v.level": {en:"Level progression", es:"Progreso de nivel", pt:"Progressão de nível", it:"Progressione di livello", fr:"Évolution du niveau", de:"Level-Verlauf", nl:"Niveauverloop", sv:"Nivåutveckling"},
    "v.next": {en:"Next", es:"Siguiente", pt:"Próximo", it:"Prossimo", fr:"Suivant", de:"Nächstes", nl:"Volgende", sv:"Nästa"},
    "v.needs": {en:"needs work", es:"a mejorar", pt:"a melhorar", it:"da migliorare", fr:"à travailler", de:"ausbaufähig", nl:"werkpunt", sv:"behöver jobbas på"},
    "v.solid": {en:"solid", es:"solido", pt:"sólido", it:"solido", fr:"solide", de:"solide", nl:"solide", sv:"stabil"},
    "v.strong": {en:"strong", es:"fuerte", pt:"forte", it:"forte", fr:"fort", de:"stark", nl:"sterk", sv:"stark"},
    "v.swipe": {en:"swipe to switch", es:"desliza para cambiar", pt:"deslize para trocar", it:"scorri per cambiare", fr:"glisse pour changer", de:"zum Wechseln wischen", nl:"swipe om te wisselen", sv:"svep för att byta"},
    "v.squadAvg": {en:"Group average", es:"Promedio del grupo", pt:"Média do grupo", it:"Media del gruppo", fr:"Moyenne du groupe", de:"Gruppenschnitt", nl:"Groepsgemiddelde", sv:"Gruppens snitt"},
    "v.noChange": {en:"no change", es:"sin cambio", pt:"sem alteração", it:"invariato", fr:"stable", de:"unverändert", nl:"geen verandering", sv:"ingen ändring"},
    "p.title": {en:"Points & rewards", es:"Puntos y premios", pt:"Pontos e recompensas", it:"Punti e premi", fr:"Points et récompenses", de:"Punkte & Prämien", nl:"Punten & beloningen", sv:"Poäng & belöningar"},
    "p.sub": {en:"Earn on court, spend at the bar. Staff scan your code.", es:"Gana en la cancha, gasta en el bar. El personal escanea tu codigo.", pt:"Ganhe na quadra, gaste no bar. O bar lê seu código.", it:"Guadagni in campo, spendi al bar. Lo staff scansiona il tuo codice.", fr:"Gagne sur le court, dépense au bar. L'équipe scanne ton code.", de:"Sammle auf dem Court, lös an der Bar ein. Das Team scannt deinen Code.", nl:"Verdien op de baan, besteed aan de bar. Het personeel scant je code.", sv:"Tjäna på banan, spendera i baren. Personalen skannar din kod."},
    "p.balance": {en:"Your balance", es:"Tu saldo", pt:"Seu saldo", it:"Il tuo saldo", fr:"Ton solde", de:"Dein Guthaben", nl:"Je saldo", sv:"Ditt saldo"},
    "p.earn": {en:"How you earn", es:"Como ganas", pt:"Como ganhar", it:"Come guadagni", fr:"Comment gagner", de:"So sammelst du", nl:"Zo verdien je", sv:"Så tjänar du poäng"},
    "p.kantine": {en:"Bar & shop", es:"Bar y tienda", pt:"Bar e loja", it:"Bar e shop", fr:"Bar et boutique", de:"Bar & Shop", nl:"Bar & shop", sv:"Bar & shop"},
    "p.inPoints": {en:"Prices in points", es:"Precios en puntos", pt:"Preços em pontos", it:"Prezzi in punti", fr:"Prix en points", de:"Preise in Punkten", nl:"Prijzen in punten", sv:"Priser i poäng"},
    "p.redeem": {en:"Redeem", es:"Canjear", pt:"Trocar", it:"Riscatta", fr:"Échanger", de:"Einlösen", nl:"Inwisselen", sv:"Lös in"},
    "p.short": {en:"Not enough", es:"Insuficiente", pt:"Faltam pontos", it:"Non bastano", fr:"Pas assez", de:"Zu wenig", nl:"Te weinig", sv:"Inte nog"},
    "p.history": {en:"Redemption history", es:"Historial de canjes", pt:"Histórico de trocas", it:"Storico riscatti", fr:"Historique des échanges", de:"Eingelöst", nl:"Inwisselgeschiedenis", sv:"Inlösta belöningar"},
    "p.show": {en:"Show this at the bar", es:"Muestra esto en el bar", pt:"Mostre isto no bar", it:"Mostralo al bar", fr:"Montre ceci au bar", de:"An der Bar zeigen", nl:"Laat dit zien aan de bar", sv:"Visa detta i baren"},
    "p.expires": {en:"Code expires in", es:"El codigo vence en", pt:"Código expira em", it:"Il codice scade tra", fr:"Code valable encore", de:"Code läuft ab in", nl:"Code verloopt over", sv:"Koden går ut om"},
    "p.expired": {en:"Code expired", es:"Codigo vencido", pt:"Código expirado", it:"Codice scaduto", fr:"Code expiré", de:"Code abgelaufen", nl:"Code verlopen", sv:"Koden har gått ut"},
    "p.again": {en:"Get a new code", es:"Pedir codigo nuevo", pt:"Gerar novo código", it:"Nuovo codice", fr:"Nouveau code", de:"Neuer Code", nl:"Nieuwe code", sv:"Hämta ny kod"},
    "p.empty": {en:"Nothing redeemed yet. A cold drink is a good start.", es:"Aun no has canjeado nada. Empieza por algo frio.", pt:"Nenhuma troca ainda. Uma bebida gelada é um bom começo.", it:"Ancora nessun riscatto. Una bibita fresca è un buon inizio.", fr:"Rien d'échangé pour l'instant. Une boisson fraîche, c'est un bon début.", de:"Noch nichts eingelöst. Ein kaltes Getränk ist ein guter Anfang.", nl:"Nog niets ingewisseld. Een koud drankje is een mooi begin.", sv:"Inget inlöst än. En kall dricka är en bra start."},
    "h.title": {en:"At-home training", es:"Entreno en casa", pt:"Treino em casa", it:"Allenamento a casa", fr:"Entraînement à la maison", de:"Training zu Hause", nl:"Thuistraining", sv:"Träning hemma"},
    "h.sub": {en:"Drills your coaches film. Finish one, it lands in your file.", es:"Drills que graban tus coaches. Termina uno y entra en tu ficha.", pt:"Exercícios gravados pelos seus treinadores. Termine um e ele vai para sua ficha.", it:"Esercizi filmati dai tuoi coach. Finiscine uno e finisce nella tua scheda.", fr:"Des exercices filmés par tes coachs. Termine-en un, il arrive dans ton dossier.", de:"Übungen, die deine Coaches filmen. Erledigt landet sie in deinem Profil.", nl:"Oefeningen gefilmd door je trainers. Rond er één af en hij staat in je dossier.", sv:"Övningar som tränarna filmar. Gör en, så hamnar den i din profil."},
    "h.mark": {en:"Mark complete", es:"Marcar hecho", pt:"Marcar como feito", it:"Segna come fatto", fr:"Marquer fait", de:"Als erledigt markieren", nl:"Afronden", sv:"Markera klar"},
    "h.done": {en:"Completed", es:"Hecho", pt:"Concluído", it:"Fatto", fr:"Terminé", de:"Erledigt", nl:"Afgerond", sv:"Klar"},
    "h.upload": {en:"Upload a drill", es:"Subir un drill", pt:"Enviar exercício", it:"Carica un esercizio", fr:"Ajouter un exercice", de:"Übung hochladen", nl:"Oefening uploaden", sv:"Ladda upp en övning"},
    "h.assignment": {en:"This week's assignment", es:"Tarea de esta semana", pt:"Tarefa da semana", it:"Compito della settimana", fr:"Exercice de la semaine", de:"Aufgabe der Woche", nl:"Opdracht van deze week", sv:"Veckans uppgift"},
    "q.title": {en:"Group standings", es:"Clasificacion del grupo", pt:"Classificação do grupo", it:"Classifica del gruppo", fr:"Classement du groupe", de:"Gruppen-Rangliste", nl:"Groepsstand", sv:"Grupptabell"},
    "q.sub": {en:"Points earned this season. Resets in January.", es:"Puntos de esta temporada. Se reinicia en enero.", pt:"Pontos ganhos nesta temporada. Reinicia em janeiro.", it:"Punti guadagnati in questa stagione. Si azzera a gennaio.", fr:"Points gagnés cette saison. Remise à zéro en janvier.", de:"Punkte dieser Saison. Reset im Januar.", nl:"Punten verdiend dit seizoen. Reset in januari.", sv:"Poäng intjänade denna säsong. Nollställs i januari."},
    "q.rank": {en:"Rank", es:"Puesto", pt:"Posição", it:"Pos.", fr:"Rang", de:"Platz", nl:"Plek", sv:"Plats"},
    "q.you": {en:"you", es:"tu", pt:"você", it:"tu", fr:"toi", de:"du", nl:"jij", sv:"du"},
    "q.badges": {en:"Your badges", es:"Tus insignias", pt:"Suas medalhas", it:"I tuoi badge", fr:"Tes badges", de:"Deine Badges", nl:"Je badges", sv:"Dina märken"},
    "q.locked": {en:"Locked", es:"Bloqueado", pt:"Bloqueada", it:"Bloccato", fr:"Verrouillé", de:"Gesperrt", nl:"Vergrendeld", sv:"Låst"},
    "t.title": {en:"Coach tools", es:"Panel del coach", pt:"Ferramentas do treinador", it:"Strumenti coach", fr:"Outils coach", de:"Coach-Tools", nl:"Trainerstools", sv:"Tränarverktyg"},
    "t.sub": {en:"Check the group in, score a skill, post a drill.", es:"Registra asistencia, puntua una tecnica, sube un drill.", pt:"Marque presença, avalie um golpe, publique um exercício.", it:"Segna le presenze, valuta un colpo, pubblica un esercizio.", fr:"Pointe le groupe, note un coup, publie un exercice.", de:"Gruppe einchecken, Skill bewerten, Übung posten.", nl:"Groep inchecken, een skill scoren, een oefening plaatsen.", sv:"Checka in gruppen, betygsätt en färdighet, lägg upp en övning."},
    "t.roster": {en:"Today's check-in", es:"Check-in de hoy", pt:"Presenças de hoje", it:"Presenze di oggi", fr:"Pointage du jour", de:"Check-in heute", nl:"Check-in van vandaag", sv:"Dagens incheckning"},
    "t.in": {en:"Check in", es:"Registrar", pt:"Marcar", it:"Segna presente", fr:"Pointer", de:"Einchecken", nl:"Inchecken", sv:"Checka in"},
    "t.present": {en:"Checked in", es:"Presente", pt:"Presente", it:"Presente", fr:"Présent", de:"Eingecheckt", nl:"Ingecheckt", sv:"Incheckad"},
    "t.assess": {en:"Quick assessment", es:"Evaluacion rapida", pt:"Avaliação rápida", it:"Valutazione rapida", fr:"Évaluation rapide", de:"Schnellbewertung", nl:"Snelle beoordeling", sv:"Snabbedömning"},
    "t.assessSub": {en:"Score a skill and the player sees it in Development.", es:"Puntua y el jugador lo ve en Desarrollo.", pt:"Avalie um golpe e o jogador vê em Evolução.", it:"Valuta un colpo e il giocatore lo vede in Crescita.", fr:"Note un coup et le joueur le voit dans Progression.", de:"Bewerte einen Skill, der Spieler sieht ihn unter Entwicklung.", nl:"Scoor een skill en de speler ziet het bij Ontwikkeling.", sv:"Betygsätt en färdighet så ser spelaren det under Utveckling."},
    "t.newDrill": {en:"New home drill", es:"Nuevo drill en casa", pt:"Novo exercício para casa", it:"Nuovo esercizio a casa", fr:"Nouvel exercice maison", de:"Neue Heimübung", nl:"Nieuwe thuisoefening", sv:"Ny hemmaövning"},
    "t.drillName": {en:"Drill name", es:"Nombre del drill", pt:"Nome do exercício", it:"Nome dell'esercizio", fr:"Nom de l'exercice", de:"Name der Übung", nl:"Naam oefening", sv:"Övningens namn"},
    "t.publish": {en:"Publish to the group", es:"Publicar al grupo", pt:"Publicar no grupo", it:"Pubblica al gruppo", fr:"Publier pour le groupe", de:"In der Gruppe posten", nl:"Plaats in de groep", sv:"Publicera för gruppen"},
    "k.title": {en:"Bar staff", es:"Personal del bar", pt:"Balcão do bar", it:"Staff bar", fr:"Équipe du bar", de:"Bar-Team", nl:"Barpersoneel", sv:"Barpersonal"},
    "k.sub": {en:"Type the code from the player's screen to confirm it.", es:"Escribe el codigo de la pantalla del jugador.", pt:"Digite o código da tela do jogador para confirmar.", it:"Digita il codice dallo schermo del giocatore per confermarlo.", fr:"Tape le code affiché sur l'écran du joueur pour le confirmer.", de:"Gib den Code vom Spielerhandy ein, um ihn zu bestätigen.", nl:"Typ de code van het scherm van de speler om te bevestigen.", sv:"Skriv in koden från spelarens skärm för att bekräfta."},
    "k.code": {en:"Redemption code", es:"Codigo", pt:"Código de troca", it:"Codice di riscatto", fr:"Code d'échange", de:"Einlösecode", nl:"Inwisselcode", sv:"Inlösenkod"},
    "k.check": {en:"Check code", es:"Comprobar", pt:"Verificar código", it:"Verifica codice", fr:"Vérifier le code", de:"Code prüfen", nl:"Code checken", sv:"Kolla koden"},
    "k.valid": {en:"Valid", es:"Valido", pt:"Válido", it:"Valido", fr:"Valide", de:"Gültig", nl:"Geldig", sv:"Giltig"},
    "k.hand": {en:"Hand it over and confirm", es:"Entrega y confirma", pt:"Entregue e confirme", it:"Consegna e conferma", fr:"Remets l'article et confirme", de:"Übergeben und bestätigen", nl:"Geef het af en bevestig", sv:"Lämna över och bekräfta"},
    "k.unknown": {en:"No code like that. Ask the player to refresh.", es:"Codigo desconocido. Pide al jugador que actualice.", pt:"Código não encontrado. Peça ao jogador para atualizar.", it:"Codice inesistente. Chiedi al giocatore di aggiornare.", fr:"Ce code n'existe pas. Demande au joueur d'actualiser.", de:"Diesen Code gibt es nicht. Der Spieler soll neu laden.", nl:"Deze code bestaat niet. Vraag de speler te verversen.", sv:"Ingen sådan kod. Be spelaren uppdatera."},
    "k.used": {en:"Already confirmed", es:"Ya confirmado", pt:"Já confirmado", it:"Già confermato", fr:"Déjà confirmé", de:"Schon bestätigt", nl:"Al bevestigd", sv:"Redan bekräftad"},
    "k.confirmed": {en:"Confirmed", es:"Confirmado", pt:"Confirmado", it:"Confermato", fr:"Confirmé", de:"Bestätigt", nl:"Bevestigd", sv:"Bekräftad"},
    "k.scan": {en:"Scan the code", es:"Escanear codigo", pt:"Ler o código", it:"Scansiona il codice", fr:"Scanner le code", de:"Code scannen", nl:"Scan de code", sv:"Skanna koden"},
    "k.scanStop": {en:"Stop", es:"Parar", pt:"Parar", it:"Stop", fr:"Arrêter", de:"Stopp", nl:"Stop", sv:"Stopp"},
    "k.torch": {en:"Light", es:"Luz", pt:"Luz", it:"Luce", fr:"Lampe", de:"Licht", nl:"Lamp", sv:"Lampa"},
    "k.scanHint": {en:"Point at the code on the player's phone.", es:"Apunta al codigo en el telefono del jugador.", pt:"Aponte para o código no aparelho do jogador.", it:"Inquadra il codice sul telefono del giocatore.", fr:"Vise le code sur le téléphone du joueur.", de:"Auf den Code am Spielerhandy richten.", nl:"Richt op de code op de telefoon van de speler.", sv:"Rikta mot koden i spelarens mobil."},
    "k.or": {en:"or type it", es:"o escribelo", pt:"ou digite", it:"o digitalo", fr:"ou tape-le", de:"oder eintippen", nl:"of typ hem in", sv:"eller skriv in den"},
    "k.waiting": {en:"Waiting at the bar", es:"Esperando en el bar", pt:"Aguardando no bar", it:"In attesa al bar", fr:"En attente au bar", de:"Wartet an der Bar", nl:"Wacht aan de bar", sv:"Väntar i baren"},
    "k.noScan": {en:"This browser cannot scan. Use the phone camera app on the QR, or type the code.", es:"Este navegador no puede escanear. Usa la app de camara sobre el QR, o escribe el codigo.", pt:"Este navegador não lê códigos. Use a câmera do aparelho no QR, ou digite o código.", it:"Questo browser non può scansionare. Usa la fotocamera del telefono sul QR o digita il codice.", fr:"Ce navigateur ne peut pas scanner. Utilise l'appareil photo du téléphone sur le QR, ou tape le code.", de:"Dieser Browser kann nicht scannen. Scanne den QR mit der Kamera-App oder tipp den Code ein.", nl:"Deze browser kan niet scannen. Gebruik de camera-app op de QR, of typ de code.", sv:"Den här webbläsaren kan inte skanna. Använd mobilens kameraapp på QR-koden, eller skriv in koden."},
    "k.denied": {en:"Camera blocked. Allow it in the browser settings, or type the code.", es:"Camara bloqueada. Permitela en los ajustes, o escribe el codigo.", pt:"Câmera bloqueada. Permita nas configurações do navegador, ou digite o código.", it:"Fotocamera bloccata. Consentila nelle impostazioni del browser o digita il codice.", fr:"Caméra bloquée. Autorise-la dans les réglages du navigateur, ou tape le code.", de:"Kamera blockiert. Erlaube sie in den Browser-Einstellungen oder tipp den Code ein.", nl:"Camera geblokkeerd. Sta hem toe in de browserinstellingen, of typ de code.", sv:"Kameran är blockerad. Tillåt den i webbläsarens inställningar, eller skriv in koden."},
    "k.nocam": {en:"No camera on this device. Type the code instead.", es:"Sin camara en este dispositivo. Escribe el codigo.", pt:"Este aparelho não tem câmera. Digite o código.", it:"Nessuna fotocamera su questo dispositivo. Digita il codice.", fr:"Pas de caméra sur cet appareil. Tape le code à la place.", de:"Keine Kamera auf diesem Gerät. Tipp den Code ein.", nl:"Geen camera op dit apparaat. Typ de code in.", sv:"Ingen kamera på den här enheten. Skriv in koden i stället."},
    "k.scanned": {en:"Scanned", es:"Escaneado", pt:"Lido", it:"Scansionato", fr:"Scanné", de:"Gescannt", nl:"Gescand", sv:"Skannad"},
    "k.queueEmpty": {en:"No codes waiting.", es:"Ningun codigo esperando.", pt:"Nenhum código aguardando.", it:"Nessun codice in attesa.", fr:"Aucun code en attente.", de:"Keine Codes in der Warteschlange.", nl:"Geen codes in de wachtrij.", sv:"Inga koder väntar."},
    "p.live": {en:"Code live at the bar", es:"Codigo activo en el bar", pt:"Código ativo no bar", it:"Codice attivo al bar", fr:"Code actif au bar", de:"Code an der Bar aktiv", nl:"Code actief aan de bar", sv:"Koden är aktiv i baren"},
    "p.showQr": {en:"Show the code", es:"Mostrar codigo", pt:"Mostrar o código", it:"Mostra il codice", fr:"Afficher le code", de:"Code zeigen", nl:"Toon de code", sv:"Visa koden"},
    "p.tapShow": {en:"Tap to show again", es:"Toca para mostrar de nuevo", pt:"Toque para mostrar de novo", it:"Tocca per rivederlo", fr:"Touche pour réafficher", de:"Tippen zum erneuten Zeigen", nl:"Tik om opnieuw te tonen", sv:"Tryck för att visa igen"},
    "c.share": {en:"Share", es:"Compartir", pt:"Compartilhar", it:"Condividi", fr:"Partager", de:"Teilen", nl:"Delen", sv:"Dela"},
    "c.undo": {en:"Undo", es:"Deshacer", pt:"Desfazer", it:"Annulla", fr:"Annuler", de:"Rückgängig", nl:"Ongedaan maken", sv:"Ångra"},
    "d.doNext": {en:"Do this next", es:"Haz esto ahora", pt:"Faça isto agora", it:"Il prossimo passo", fr:"À faire ensuite", de:"Als Nächstes", nl:"Doe dit nu", sv:"Gör det här nu"},
    "d.nbaRsvp": {en:"Say if you are coming to the next session.", es:"Di si vienes a la proxima sesion.", pt:"Diga se vai à próxima sessão.", it:"Dicci se vieni alla prossima sessione.", fr:"Dis si tu viens à la prochaine séance.", de:"Sag Bescheid, ob du zur nächsten Einheit kommst.", nl:"Laat weten of je naar de volgende training komt.", sv:"Säg om du kommer på nästa pass."},
    "d.nbaDrill": {en:"One home drill and your week goal is done.", es:"Un drill en casa y cierras tu meta.", pt:"Um exercício em casa e sua meta da semana está feita.", it:"Un esercizio a casa e l'obiettivo della settimana è fatto.", fr:"Un exercice maison et ton objectif de la semaine est atteint.", de:"Eine Heimübung und dein Wochenziel ist geschafft.", nl:"Nog één thuisoefening en je weekdoel is binnen.", sv:"En hemmaövning till så är veckans mål klart."},
    "d.nbaSpend": {en:"You have enough points for something cold.", es:"Tienes puntos para algo frio.", pt:"Você tem pontos para algo gelado.", it:"Hai abbastanza punti per qualcosa di fresco.", fr:"Tu as assez de points pour une boisson fraîche.", de:"Deine Punkte reichen für was Kaltes.", nl:"Je hebt genoeg punten voor iets kouds.", sv:"Du har poäng nog för något kallt."},
    "d.nbaDone": {en:"You are on top of everything. Go play.", es:"Todo al dia. A jugar.", pt:"Está tudo em dia. Vá jogar.", it:"Sei in pari con tutto. Vai a giocare.", fr:"Tu es à jour sur tout. Va jouer.", de:"Du hast alles erledigt. Ab auf den Court.", nl:"Je bent helemaal bij. Ga spelen.", sv:"Du har koll på allt. Ut och spela."},
    "t.session": {en:"Session", es:"Sesion", pt:"Sessão", it:"Sessione", fr:"Séance", de:"Einheit", nl:"Training", sv:"Pass"},
    "t.find": {en:"Find a player", es:"Buscar jugador", pt:"Procurar jogador", it:"Cerca un giocatore", fr:"Trouver un joueur", de:"Spieler suchen", nl:"Zoek een speler", sv:"Hitta en spelare"},
    "t.all": {en:"All in", es:"Todos", pt:"Todos presentes", it:"Tutti presenti", fr:"Tous présents", de:"Alle da", nl:"Iedereen in", sv:"Alla in"},
    "t.clear": {en:"Clear", es:"Limpiar", pt:"Limpar", it:"Azzera", fr:"Effacer", de:"Leeren", nl:"Wissen", sv:"Rensa"},
    "t.noPlayer": {en:"Nobody by that name.", es:"Nadie con ese nombre.", pt:"Ninguém com esse nome.", it:"Nessuno con questo nome.", fr:"Personne à ce nom.", de:"Niemand mit diesem Namen.", nl:"Niemand met die naam.", sv:"Ingen med det namnet."},
    "t.checkedOf": {en:"in", es:"dentro", pt:"presentes", it:"presenti", fr:"présents", de:"da", nl:"in", sv:"in"}
  };

  var lang = "en";

  function t(key, vars){
    var row = STR[key];
    var s = row ? (row[lang] || row.en) : key;
    if(vars) Object.keys(vars).forEach(function(k){ s = s.replace("{" + k + "}", vars[k]); });
    return s;
  }

  function apply(root){
    (root || document).querySelectorAll("[data-i18n]").forEach(function(el){
      el.textContent = t(el.getAttribute("data-i18n"));
    });
    (root || document).querySelectorAll("[data-i18n-attr]").forEach(function(el){
      el.getAttribute("data-i18n-attr").split(",").forEach(function(pair){
        var bits = pair.split(":");
        el.setAttribute(bits[0].trim(), t(bits[1].trim()));
      });
    });
    document.documentElement.lang = lang;
  }

  function set(id, silent){
    if(!LANGS.some(function(l){ return l.id === id; })) id = "en";
    lang = id;
    if(window.r2store) window.r2store.patch({lang:id});
    try{ localStorage.setItem("pv.lang", id); }catch(e){}
    apply(document);
    if(!silent) document.dispatchEvent(new CustomEvent("r2:lang", {detail:id}));
  }

  /* first visit: what the visitor picked on the website, else the phone language */
  function initial(saved){
    var ok = function(id){ return LANGS.some(function(l){ return l.id === id; }); };
    try{ var s = localStorage.getItem("pv.lang"); if(s && ok(s)) return s; }catch(e){}
    if(saved && ok(saved)) return saved;
    var list = navigator.languages || [navigator.language || "en"];
    for(var i=0;i<list.length;i++){ var id = String(list[i]||"").slice(0,2).toLowerCase(); if(ok(id)) return id; }
    return "en";
  }

  return {
    initial: initial,
    langs: LANGS,
    t: t,
    apply: apply,
    set: set,
    get current(){ return lang; }
  };
})();
