import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { Stack, Text, Button, Group, Paper, Modal } from '@mantine/core';

const IPBanPanel = ({ bannedIPs, onUnban }) => {
  const [unbanConfirm, setUnbanConfirm] = useState(null);

  const handleUnbanClick = (ip) => {
    setUnbanConfirm(ip);
  };

  const handleConfirmUnban = () => {
    onUnban(unbanConfirm);
    setUnbanConfirm(null);
  };

  return (
    <Paper withBorder p="md">
      <Stack>
        <Text fw={500}>IP Ban Management</Text>
        {bannedIPs && bannedIPs.length > 0 ? (
          <Stack spacing="xs">
            {bannedIPs.map((ip) => (
              <Group key={ip} position="apart">
                <Text>{ip}</Text>
                <Button size="xs" color="red" onClick={() => handleUnbanClick(ip)}>
                  Unban
                </Button>
              </Group>
            ))}
          </Stack>
        ) : (
          <Text c="dimmed">No IPs are currently banned.</Text>
        )}
      </Stack>

      <Modal
        opened={!!unbanConfirm}
        onClose={() => setUnbanConfirm(null)}
        title="Confirm Unban"
      >
        <Text>Are you sure you want to unban {unbanConfirm}?</Text>
        <Group position="right" mt="md">
          <Button variant="default" onClick={() => setUnbanConfirm(null)}>
            Cancel
          </Button>
          <Button color="red" onClick={handleConfirmUnban}>
            Unban
          </Button>
        </Group>
      </Modal>
    </Paper>
  );
};

IPBanPanel.propTypes = {
  bannedIPs: PropTypes.arrayOf(PropTypes.string).isRequired,
  onUnban: PropTypes.func.isRequired,
};

export default IPBanPanel;