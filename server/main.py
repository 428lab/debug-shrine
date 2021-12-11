#!/usr/bin/env python
# -*- coding: utf-8 -*-
import model.activities as activities

# itemFilter = ["IssuesEvent"]

test = activities.activities()
test.get_activities_from_github('ShinoharaTa')
test.firebase_test()

