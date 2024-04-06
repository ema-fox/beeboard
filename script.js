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
    goal.weekdue = goal.rah - goal.curval;

    goal.days = Object.values(goal.dueby).map(x => x.delta);
    goal.days.push(goal.weekdue);

    goal.maxrate = Math.max(goal.rate, goal.currate, ...deltas(goal.days));
    goal.fraction = today / goal.maxrate;

    goal.week = goal.today + goal.weekdue
    goal.weekfraction = goal.today / goal.week;

    if (goal.fraction > 1) {
        goal.fraction = 1 + goal.weekfraction;
    }
}

function deltas(xs) {
    return xs.slice(1).map((y, i) => y - xs[i]).filter(x => x);
}

function create_chunks(class_prefix, xs, divisor) {
    let ys = deltas(xs);
    return ys.map(y => {
        let el = document.createElement('div');
        el.className = `chunk ${class_prefix}`;
        el.style.width = `${100 * y / divisor}%`;
        return el;
    });
}

function buf_class(x) {
    return 'buf-' + (x < 3 ? x : x < 8 ? 3 : 8)
}

let formatter = new Intl.NumberFormat('en-US', {style: 'decimal', maximumFractionDigits: 2});

function show_progress(goal, i) {
    let days_adjusted = goal.days.map(x => x + goal.today);

    let prev = days_adjusted.filter(x => x <= 0);
    let today = days_adjusted.filter(x => 0 < x && x <= goal.maxrate);
    let next = days_adjusted.filter(x => goal.maxrate < x);

    if (prev.length) {
        prev.push(0);
    }

    today.unshift(0);

    if (next.length) {
        today.push(goal.maxrate);
        next.unshift(goal.maxrate);
    }

    let today_done = today.filter(x => x <= goal.today);
    let today_undone = today.filter(x => goal.today < x);

    if (goal.today < goal.maxrate) {
        today_done.push(goal.today);
        today_undone.unshift(goal.today);
    }


    let next_done = next.filter(x => x <= goal.today);
    let next_undone = next.filter(x => goal.today < x);

    if (goal.maxrate <= goal.today) {
        next_done.push(goal.today);
        next_undone.unshift(goal.today);
    }

    //console.log(goal.slug, goal.today, days, days_adjusted, deltas(prev), deltas(today_done), deltas(today_undone), deltas(next_done), deltas(next_undone));


    let hover_text = `${goal.today} ${goal.gunits} done today`;

    let label = document.createElement('label');
    label.innerText = goal.slug;

    let prev_el = document.createElement('div');
    prev_el.className = 'prev-bar chunk-bar';

    let prev_space = document.createElement('span');
    prev_space.className = 'space';
    prev_el.append(prev_space);

    let today_el = document.createElement('div');
    today_el.className = 'today-bar chunk-bar ' + buf_class(goal.safebuf);

    let dayduep = goal.today < goal.maxrate;

    let number = document.createElement('span');
    number.className = 'number ' + (dayduep ? 'day-due' : 'week-due');
    number.innerText = formatter.format(dayduep ? Math.min(goal.maxrate - goal.today, goal.weekdue) : goal.weekdue);

    today_el.append(label, number);

    let next_el = document.createElement('div');
    next_el.className = 'next-bar chunk-bar ' + buf_class(goal.safebuf);

    let unit = document.createElement('span');
    unit.className = 'unit ' + (dayduep ? 'day-due' : 'week-due');
    unit.innerText = goal.gunits;

    next_el.append(unit);

    prev_el.title = hover_text;
    today_el.title = hover_text;
    next_el.title = hover_text;

    prev_el.append(...create_chunks('prev', prev, goal.maxrate * 6));
    today_el.append(...create_chunks('today-done', today_done, goal.maxrate),
                    ...create_chunks('today-undone', today_undone, goal.maxrate));
    next_el.append(...create_chunks('next-done', next_done, goal.maxrate * 6),
                   ...create_chunks('next-undone', next_undone, goal.maxrate * 6));

    let goel = document.createElement('div');
    goel.className = 'goel ' + buf_class(goal.safebuf);

    goel.append(prev_el, today_el, next_el);
    B.append(goel);
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
            B.innerHTML = '';

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
