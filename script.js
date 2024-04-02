let conf = {};

try {
    conf = JSON.parse(localStorage.beeboard);
} catch (Error) {
}

function add_today(goal) {
    let today = 0;

    switch (goal.aggday) {
    case 'last':
        today = goal.last_datapoint.value - Math.max(...goal.prev_data.map(x => x.value));
        break;
    default:
        goal.today_data.forEach(x => {
            switch (goal.aggday) {
            case 'count':
                today += 1;
                break;
            case 'sum':
                today += x.value;
                break;
            default:
                console.warn('not implemented: ', goal.aggday);
            }
        });
    }

    goal.today = today;
    goal.maxrate = Math.max(goal.rate, goal.currate);
    goal.fraction = today / goal.maxrate;

    goal.weekdue = goal.rah - goal.curval;
    goal.week = goal.today + goal.weekdue
    goal.weekfraction = goal.today / goal.week;

    if (goal.fraction > 1) {
        goal.fraction = 1 + goal.weekfraction;
    }
}

function add_progress(parent, class_prefix, min, max, value, unit_text, row) {
    let p = document.createElement('progress');
    let pp = document.createElement('span');
    pp.append(p);
    pp.className = class_prefix + '-bar';
    pp.title = value + ' ' + unit_text;
    let number = document.createElement('span');
    number.className = 'number ' + class_prefix + '-number';
    number.style.gridRow = row;
    let unit = document.createElement('span');
    unit.className = 'unit ' + class_prefix + '-unit';
    unit.style.gridRow = row;

    if (value < max) {
        number.innerText = Math.ceil(max - value);
        unit.innerText = unit_text;
    }
    p.max = max - min;
    p.value = value - min;
    add_progress2(parent, class_prefix, min, max, value, unit_text, row);
    parent.append(number, unit);
}


function add_progress2(parent, class_prefix, min, max, value, unit_text, row) {
    let bar = document.createElement('div');
    bar.className = class_prefix + '-bar bar';
    bar.style.gridRow = row;
    bar.title = value + ' ' + unit_text;

    progress = document.createElement('div');
    progress.className = 'progress';
    progress.style.width = `${100 * (value - min) / (max - min)}%`;
    bar.append(progress);
    parent.append(bar);
}

function show_progress(goal, i) {
    let row = i + 1;
    let goel = document.createElement('div');
    let label = document.createElement('label');
    label.innerText = goal.slug + '';
    label.style.gridRow = row;
    goel.className = 'goel ' + 'buf-' + (goal.safebuf < 3 ? goal.safebuf : goal.safebuf < 8 ? 3 : 8);
    if (goal.week <= goal.maxrate) {
        add_progress(goel, 'day', 0, goal.maxrate, goal.today, goal.gunits, row);
    } else {
        add_progress(goel, 'day', 0, goal.maxrate, goal.today, goal.gunits, row);
        add_progress(goel, 'week', goal.maxrate, goal.week, goal.today, goal.gunits, row);
    }
    goel.append(label);
    A.append(goel);
}

let requests = 0;
let responses = 0;

function show_loading() {
    if (responses === requests) {
        Message.innerHTML = '&nbsp;';
    } else {
        Message.innerText = `loading ${responses}/${requests}`;
    }
}

async function get_goals() {
    try {
        let {username, auth_token} = conf;
        if (username && auth_token) {
            requests++;
            show_loading();
            let response = await (await fetch(`https://www.beeminder.com/api/v1/users/${username}/goals.json?auth_token=${auth_token}`)).json();
            responses++;
            show_loading();
            console.log(response);
            for (let goal of response) {
                if (goal.todayta) {
                    let todaystamp = goal.recent_data.map(x => x.daystamp).reduce((x, y) => x < y ? y : x);
                    goal.today_data = goal.recent_data.filter(x => x.daystamp === todaystamp);
                    if (goal.today_data.length === goal.recent_data.length) {
                        requests++;
                        show_loading();
                        goal.recent_data = await (await fetch(`https://www.beeminder.com/api/v1/users/${username}/goals/${goal.slug}/datapoints.json?auth_token=${auth_token}&count=50`)).json();
                        responses++;
                        show_loading();
                        goal.today_data = goal.recent_data.filter(x => x.daystamp === todaystamp);
                    }
                    goal.prev_data = goal.recent_data.filter(x => x.daystamp !== todaystamp);
                } else {
                    goal.today_data = [];
                    goal.prev_data = goal.recent_data;
                }
            }
            A.innerHTML = '';
            response.forEach(add_today);
            response.filter(goal => goal.safebuf <= 7).toSorted((a, b) => a.fraction - b.fraction)
                .forEach(show_progress);
        } else {
            Conf_form.style.display = 'block';
            return;
        }
    } catch (Error) {
        Message.innerText = Error;
        throw Error;
    } finally {
        Reload.disabled = false;
    }
}

function reload() {
    requests = 0;
    responses = 0;
    Reload.disabled = true;
    get_goals();
}

addEventListener('DOMContentLoaded', event => {
    Reload.disabled = true;
    get_goals();
})

function configure() {
    try {
        conf = JSON.parse(Conf.value);
        localStorage.beeboard = JSON.stringify(conf);
        Conf_form.style.display = 'none';
        reload();
    } catch (Error) {
        Message.innerText = Error;
        throw Error;
    }
}
