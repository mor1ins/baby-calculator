import PropTypes from 'prop-types';
import { useRef, useState } from 'react';

import { ErrorMessage, Form, Loading } from './Forms.jsx';
import { Icon } from './Icon.jsx';
import { Button } from './Mobile.jsx';
import { Sheet } from './Sheet.jsx';
import { today } from './time.js';
import { useRead, useWrite } from './useApi.js';

function age(born, zone) {
    if (!born) return 'Укажите дату рождения';
    const [year, month, day] = today(zone).split('-').map(Number);
    const [birthYear, birthMonth, birthDay] = born.split('-').map(Number);
    const months = (year - birthYear) * 12 + month - birthMonth - Number(day < birthDay);
    return months >= 12 ? `${Math.floor(months / 12)} г. ${months % 12} м.` : `${Math.max(0, months)} мес.`;
}

export function ChildCard({ profile = false, zone }) {
    const query = useRead({ action: 'child' });
    const [editing, setEditing] = useState(null);
    const child = query.data?.profile || {};
    return (
        <Loading query={query}>
            <section className={`child-card ${profile ? 'child-card-profile' : ''}`}>
                <button
                    type="button"
                    className="child-photo"
                    aria-label="Изменить фото малыша"
                    onClick={() => setEditing('profile')}
                >
                    <ChildPhoto child={child} />
                </button>
                <div>
                    <span className="kicker">ВАШ МАЛЫШ</span>
                    <h2>{child.name || 'Малыш'}</h2>
                    <p>
                        {age(child.born, zone)}
                        {child.sex === 'boy' ? ' · Мальчик' : child.sex === 'girl' ? ' · Девочка' : ''}
                    </p>
                </div>
                <Button
                    className="icon-button"
                    aria-label="Редактировать профиль малыша"
                    onClick={() => setEditing('profile')}
                >
                    <Icon name="sliders" />
                </Button>
            </section>
            {profile && (
                <Button className="outline-button" onClick={() => setEditing('context')}>
                    О малыше и привычках сна
                </Button>
            )}
            {editing && (
                <ChildEditor
                    value={query.data}
                    context={editing === 'context'}
                    zone={zone}
                    close={() => setEditing(null)}
                />
            )}
        </Loading>
    );
}
ChildCard.propTypes = { profile: PropTypes.bool, zone: PropTypes.string };

export function ChildPhoto({ child }) {
    return child.photo ? (
        <img src={child.photo} alt="Фото малыша" />
    ) : (
        <span aria-hidden="true">{child.name?.slice(0, 1) || '◔'}</span>
    );
}
ChildPhoto.propTypes = { child: PropTypes.object.isRequired };

const contextFields = [
    ['context', 'Когда изменился сон и каким был раньше', 2000],
    ['premature', 'Недоношенность / срок рождения', 200],
    ['feeding', 'Питание', 500],
    ['environment', 'Условия сна', 1000],
    ['health', 'Здоровье и самочувствие', 1000],
].map(([name, label, maxLength]) => ({ name, label, maxLength, type: 'textarea' }));

function ChildEditor({ value, context, close, zone }) {
    const mutation = useWrite();
    const photoMutation = useWrite();
    const [photo, setPhoto] = useState(value.profile.photo || '');
    const generation = useRef(0);
    const fields = context
        ? contextFields
        : [
              { name: 'name', label: 'Имя малыша', required: true, maxLength: 40 },
              { name: 'born', label: 'Дата рождения', type: 'date', required: true, max: today(zone) },
              {
                  name: 'sex',
                  label: 'Пол',
                  options: [
                      ['unknown', 'Не указан'],
                      ['boy', 'Мальчик'],
                      ['girl', 'Девочка'],
                  ],
              },
          ];
    const upload = async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const current = ++generation.current;
        try {
            const next = await photoMutation.mutateAsync({ action: 'preparePhoto', values: { file } });
            if (current === generation.current) setPhoto(next);
        } catch {
            /* Error is presented below. */
        }
    };
    return (
        <Sheet title={context ? 'О малыше и привычках сна' : 'Профиль малыша'} close={close}>
            {!context && (
                <>
                    <div className="photo-editor">
                        <div className="child-photo photo-large">
                            <ChildPhoto child={{ ...value.profile, photo }} />
                        </div>
                        <div>
                            <label htmlFor="child-photo" className="photo-upload">
                                Добавить фото
                            </label>
                            <input
                                id="child-photo"
                                className="photo-file"
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                onChange={upload}
                            />
                            <Button
                                className="text-button"
                                onClick={() => {
                                    generation.current++;
                                    setPhoto('');
                                }}
                            >
                                Удалить фото
                            </Button>
                        </div>
                    </div>
                    <p className="form-note">JPG, PNG или WebP, до 5 МБ.</p>
                    <ErrorMessage error={photoMutation.error} />
                </>
            )}
            <Form
                fields={fields}
                initial={{ sex: 'unknown', ...value.profile }}
                disabled={photoMutation.isPending}
                label={context ? 'Сохранить' : 'Сохранить профиль малыша'}
                submit={async (values) => {
                    await mutation.mutateAsync({
                        action: 'updateChild',
                        version: value.version,
                        values: { ...value.profile, ...values, photo },
                    });
                    close();
                }}
            >
                <p className="form-note">
                    {context
                        ? 'Эти сведения видны только вам.'
                        : 'Возраст рассчитывается автоматически. Имя, возраст и фото будут видны в публичном отчёте. Пол и дата рождения в него не включаются.'}
                </p>
            </Form>
        </Sheet>
    );
}
ChildEditor.propTypes = {
    value: PropTypes.object.isRequired,
    context: PropTypes.bool,
    close: PropTypes.func.isRequired,
    zone: PropTypes.string,
};
