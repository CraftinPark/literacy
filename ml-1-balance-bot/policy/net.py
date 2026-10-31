"""The balance policy: a small MLP trained in the training sim. Observation [pitch rad, pitch rate rad/s,
wheel travel m, wheel speed m/s]; action in [-1, 1] (fraction of the motor's torque limit)."""
import os

import numpy as np
import torch
from torch import nn

HERE = os.path.dirname(os.path.abspath(__file__))
OBS_SCALE = np.array([0.2, 2.0, 0.3, 0.5], dtype=np.float32)


class PolicyNet(nn.Module):
    def __init__(self, hidden=64):
        super().__init__()
        self.body = nn.Sequential(nn.Linear(4, hidden), nn.Tanh(), nn.Linear(hidden, hidden), nn.Tanh(),
                                  nn.Linear(hidden, 1))

    def forward(self, obs):
        return torch.tanh(self.body(obs))


def load_policy(path=os.path.join(HERE, "policy.pt")):
    torch.set_num_threads(1)
    net = PolicyNet()
    net.load_state_dict(torch.load(path, weights_only=True))
    net.eval()

    def act(obs):
        with torch.no_grad():
            x = torch.from_numpy((obs / OBS_SCALE).astype(np.float32))
            return net(x)[:, 0].numpy().astype(np.float64)
    return act
