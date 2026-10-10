import { Button as KonstaButton, Card as KonstaCard, List, ListItem } from 'konsta/react';
import PropTypes from 'prop-types';

import { Icon } from './Icon.jsx';

export function Button({ className = 'primary', children, ...props }) {
    const icon = className.includes('icon-button');
    const primary = className.includes('primary');
    const outline = className.includes('outline-button');
    const preset = className.includes('period-preset');
    return (
        <KonstaButton
            rounded
            large={primary}
            outline={outline}
            clear={!primary && !outline && !preset}
            tonal={preset && props['aria-pressed'] !== true}
            inline={!primary && !outline}
            type="button"
            {...props}
            className={`${className} mobile-button ${icon ? 'mobile-icon' : ''}`}
            data-konsta="Button"
        >
            {children}
        </KonstaButton>
    );
}
Button.propTypes = { className: PropTypes.string, children: PropTypes.node };

export function Card({ className = '', children, ...props }) {
    return (
        <KonstaCard
            component="section"
            contentWrap={false}
            {...props}
            className={`card mobile-card ${className}`}
            data-konsta="Card"
        >
            {children}
        </KonstaCard>
    );
}
Card.propTypes = Button.propTypes;

export function SettingsList({ children }) {
    return (
        <List strong inset={false} className="mobile-settings" data-konsta="List">
            {children}
        </List>
    );
}
SettingsList.propTypes = { children: PropTypes.node };

export function Setting({ title, subtitle, icon, onClick }) {
    return (
        <ListItem
            component="div"
            className="mobile-setting"
            link
            linkComponent="button"
            linkProps={{ type: 'button', onClick }}
            title={title}
            subtitle={subtitle}
            media={<Icon name={icon} />}
            strongTitle={false}
            chevron
        />
    );
}
Setting.propTypes = {
    title: PropTypes.string.isRequired,
    subtitle: PropTypes.string,
    icon: PropTypes.string.isRequired,
    onClick: PropTypes.func.isRequired,
};

export function Section({ title, children }) {
    return (
        <div className="section-head">
            <h2>{title}</h2>
            {children}
        </div>
    );
}
Section.propTypes = { title: PropTypes.string.isRequired, children: PropTypes.node };
