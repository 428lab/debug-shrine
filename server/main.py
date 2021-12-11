#!/usr/bin/env python
# -*- coding: utf-8 -*-
import GitHubActivities

itemFilter = ["IssuesEvent"]

test = GitHubActivities.GitHubActivities()
test.get_activities('ShinoharaTa', itemFilter)
