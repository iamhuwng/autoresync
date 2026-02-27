import React from 'react';
import { Button } from '@mantine/core';
import SoundService from '../services/SoundService';

const SoundButton = (props) => {
  const handleClick = (e) => {
    SoundService.play('click');
    if (props.onClick) {
      props.onClick(e);
    }
  };

  return <Button {...props} onClick={handleClick} />;
};

export default SoundButton;
