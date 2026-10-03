// Names for people who do not exist yet: academy graduates of future seasons and media voices.
// Every footballer at the start of a career is real; these pools are only used for later intakes.

export const YOUTH: Record<string, { fn: string[]; ln: string[]; ru?: boolean }> = {
  RUS: {
    ru: true,
    fn: ['Александр', 'Дмитрий', 'Максим', 'Иван', 'Артём', 'Никита', 'Михаил', 'Даниил', 'Егор', 'Андрей', 'Кирилл', 'Илья', 'Алексей', 'Роман', 'Сергей', 'Владислав', 'Тимофей', 'Матвей', 'Арсений', 'Глеб', 'Денис', 'Павел', 'Ярослав', 'Степан', 'Фёдор', 'Марк', 'Лев', 'Георгий', 'Руслан', 'Тимур', 'Амир', 'Давид', 'Константин', 'Богдан', 'Вадим'],
    ln: ['Иванов', 'Смирнов', 'Кузнецов', 'Попов', 'Васильев', 'Петров', 'Соколов', 'Михайлов', 'Новиков', 'Фёдоров', 'Морозов', 'Волков', 'Алексеев', 'Лебедев', 'Семёнов', 'Егоров', 'Павлов', 'Козлов', 'Степанов', 'Николаев', 'Орлов', 'Андреев', 'Макаров', 'Никитин', 'Захаров', 'Зайцев', 'Соловьёв', 'Борисов', 'Яковлев', 'Григорьев', 'Романов', 'Воробьёв', 'Сергеев', 'Кузьмин', 'Фролов', 'Александров', 'Дмитриев', 'Королёв', 'Гусев', 'Киселёв', 'Ильин', 'Максимов', 'Поляков', 'Сорокин', 'Виноградов', 'Ковалёв', 'Белов', 'Медведев', 'Антонов', 'Тарасов', 'Жуков', 'Баранов', 'Филиппов', 'Комаров', 'Давыдов', 'Беляев', 'Герасимов', 'Богданов', 'Осипов', 'Сидоров', 'Матвеев', 'Титов', 'Марков', 'Миронов', 'Крылов', 'Куликов', 'Карпов', 'Власов', 'Мельников', 'Денисов', 'Гаврилов', 'Тихонов', 'Казаков', 'Афанасьев', 'Данилов', 'Савельев', 'Тимофеев', 'Фомин', 'Чернов', 'Абрамов', 'Мартынов', 'Ефимов', 'Федотов', 'Щербаков', 'Назаров', 'Калинин', 'Исаев', 'Чернышёв', 'Быков', 'Маслов', 'Родионов', 'Коновалов', 'Лазарев', 'Воронин', 'Климов', 'Филатов', 'Пономарёв', 'Голубев', 'Кудрявцев', 'Прохоров', 'Магомедов', 'Алиев', 'Гаджиев', 'Хасанов', 'Сафин', 'Гарипов'],
  },
  ENG: {
    fn: ['Jack', 'Harry', 'Oliver', 'George', 'Charlie', 'Jacob', 'Alfie', 'Noah', 'Oscar', 'James', 'William', 'Leo', 'Archie', 'Henry', 'Joshua', 'Freddie', 'Theo', 'Ethan', 'Lewis', 'Mason', 'Kai', 'Jude', 'Reece', 'Tyler', 'Callum', 'Rhys', 'Marcus', 'Jayden', 'Kobe', 'Trey'],
    ln: ['Smith', 'Jones', 'Taylor', 'Brown', 'Williams', 'Wilson', 'Johnson', 'Davies', 'Robinson', 'Wright', 'Thompson', 'Evans', 'Walker', 'White', 'Roberts', 'Green', 'Hall', 'Wood', 'Jackson', 'Clarke', 'Harris', 'Lewis', 'Cooper', 'King', 'Baker', 'Turner', 'Hill', 'Ward', 'Morris', 'Moore', 'Clark', 'Lee', 'Bennett', 'Carter', 'Mitchell', 'Shaw', 'Cook', 'Richardson', 'Bailey', 'Collins', 'Bell', 'Marshall', 'Adeyemi', 'Okafor', 'Mensah', 'Bakare'],
  },
  ESP: {
    fn: ['Hugo', 'Martín', 'Lucas', 'Mateo', 'Leo', 'Daniel', 'Alejandro', 'Pablo', 'Manuel', 'Álvaro', 'Adrián', 'David', 'Mario', 'Diego', 'Javier', 'Marcos', 'Sergio', 'Iker', 'Marc', 'Pau', 'Unai', 'Gorka', 'Aitor', 'Nico', 'Izan', 'Rubén', 'Carlos', 'Jorge', 'Raúl', 'Iván'],
    ln: ['García', 'Rodríguez', 'González', 'Fernández', 'López', 'Martínez', 'Sánchez', 'Pérez', 'Gómez', 'Martín', 'Jiménez', 'Ruiz', 'Hernández', 'Díaz', 'Moreno', 'Muñoz', 'Álvarez', 'Romero', 'Alonso', 'Gutiérrez', 'Navarro', 'Torres', 'Domínguez', 'Vázquez', 'Ramos', 'Gil', 'Ramírez', 'Serrano', 'Blanco', 'Molina', 'Morales', 'Suárez', 'Ortega', 'Delgado', 'Castro', 'Ortiz', 'Rubio', 'Marín', 'Sanz', 'Iglesias', 'Etxeberria', 'Zubiaurre', 'Puig', 'Ferrer'],
  },
  ITA: {
    fn: ['Leonardo', 'Francesco', 'Alessandro', 'Lorenzo', 'Mattia', 'Andrea', 'Gabriele', 'Riccardo', 'Tommaso', 'Edoardo', 'Matteo', 'Giuseppe', 'Antonio', 'Federico', 'Davide', 'Simone', 'Luca', 'Marco', 'Nicolò', 'Pietro', 'Filippo', 'Samuele', 'Christian', 'Giovanni', 'Michele'],
    ln: ['Rossi', 'Russo', 'Ferrari', 'Esposito', 'Bianchi', 'Romano', 'Colombo', 'Ricci', 'Marino', 'Greco', 'Bruno', 'Gallo', 'Conti', 'De Luca', 'Mancini', 'Costa', 'Giordano', 'Rizzo', 'Lombardi', 'Moretti', 'Barbieri', 'Fontana', 'Santoro', 'Mariani', 'Rinaldi', 'Caruso', 'Ferrara', 'Galli', 'Martini', 'Leone', 'Longo', 'Gentile', 'Martinelli', 'Vitale', 'Lombardo', 'Serra', 'Coppola', 'De Santis', 'Marchetti', 'Parisi', 'Villa', 'Conte', 'Ferri', 'Fabbri'],
  },
  GER: {
    fn: ['Leon', 'Paul', 'Jonas', 'Elias', 'Finn', 'Noah', 'Luis', 'Lukas', 'Felix', 'Maximilian', 'Ben', 'Luca', 'Tim', 'Julian', 'Niklas', 'Moritz', 'Jan', 'David', 'Fabian', 'Tom', 'Erik', 'Jannik', 'Nico', 'Philipp', 'Malik', 'Emre', 'Kerem', 'Yusuf'],
    ln: ['Müller', 'Schmidt', 'Schneider', 'Fischer', 'Weber', 'Meyer', 'Wagner', 'Becker', 'Schulz', 'Hoffmann', 'Schäfer', 'Koch', 'Bauer', 'Richter', 'Klein', 'Wolf', 'Schröder', 'Neumann', 'Schwarz', 'Zimmermann', 'Braun', 'Krüger', 'Hofmann', 'Hartmann', 'Lange', 'Schmitt', 'Werner', 'Krause', 'Meier', 'Lehmann', 'Schmid', 'Schulze', 'Maier', 'Köhler', 'Herrmann', 'König', 'Walter', 'Mayer', 'Huber', 'Kaiser', 'Fuchs', 'Peters', 'Yilmaz', 'Demir', 'Arslan'],
  },
  FRA: {
    fn: ['Lucas', 'Hugo', 'Louis', 'Nathan', 'Enzo', 'Léo', 'Gabriel', 'Jules', 'Adam', 'Raphaël', 'Arthur', 'Ethan', 'Noah', 'Tom', 'Théo', 'Mathis', 'Maxime', 'Antoine', 'Kylian', 'Ousmane', 'Ibrahima', 'Moussa', 'Mamadou', 'Rayan', 'Yanis', 'Ilyes', 'Warren', 'Désiré', 'Mathys', 'Bradley'],
    ln: ['Martin', 'Bernard', 'Dubois', 'Thomas', 'Robert', 'Richard', 'Petit', 'Durand', 'Leroy', 'Moreau', 'Simon', 'Laurent', 'Lefebvre', 'Michel', 'Garcia', 'David', 'Bertrand', 'Roux', 'Vincent', 'Fournier', 'Morel', 'Girard', 'André', 'Lefèvre', 'Mercier', 'Dupont', 'Lambert', 'Bonnet', 'François', 'Martinez', 'Diallo', 'Traoré', 'Camara', 'Koné', 'Diarra', 'Sissoko', 'Touré', 'Cissé', 'Dembélé', 'Konaté', 'Doumbia', 'Fofana', 'Sow', 'Mendy', 'Gomis'],
  },
};

/** Fictional media voices for the news feed. */
export const MEDIA: { name: string; handle: string; kind: 'insider' | 'analyst' | 'fan' | 'media' }[] = [
  { name: 'Трансферный инсайд', handle: '@transfer_inside', kind: 'insider' },
  { name: 'Футбольный агент 007', handle: '@agent_ft', kind: 'insider' },
  { name: 'Слухи РПЛ', handle: '@rpl_rumors', kind: 'insider' },
  { name: 'xG-аналитика', handle: '@xg_ru', kind: 'analyst' },
  { name: 'Тактическая доска', handle: '@tactic_board', kind: 'analyst' },
  { name: 'Цифры и мяч', handle: '@numbers_ball', kind: 'analyst' },
  { name: 'Вираж', handle: '@virazh_fans', kind: 'fan' },
  { name: 'Сектор 13', handle: '@sector13', kind: 'fan' },
  { name: 'Дядя Вася с трибуны', handle: '@tribuna_vasya', kind: 'fan' },
  { name: 'Болельщик со стажем', handle: '@fan_since_91', kind: 'fan' },
  { name: 'Спорт-Экспресс День', handle: '@sport_day', kind: 'media' },
  { name: 'Матч-центр', handle: '@match_centre', kind: 'media' },
  { name: 'Чемпионат Онлайн', handle: '@champ_online', kind: 'media' },
];

export const PRESIDENT = 'Совет директоров';
