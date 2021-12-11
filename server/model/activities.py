#!/usr/bin/env python
# -*- coding: utf-8 -*-

import requests
import datetime

class activities:

    def __init__(self):
        pass

    # def get_activities(self, user_name, item_filter = None, datetime_from = None, datetime_to = None):

    #     payload = {"Accept": "application/vnd.github.v3+json"}
    #     response = requests.get('https://api.github.com/users/' + user_name + '/events/public?per_page=100', headers=payload).json()

    #     # 検索条件フィルター条件の初期化
    #     if(datetime_from == None):
    #         datetime_from = datetime.datetime.utcnow() - datetime.timedelta(days = 100)
    #     if(datetime_to == None):
    #         datetime_to = datetime.datetime.utcnow()

    #     # フィルタリング処理
    #     result = []
    #     for item in response:
    #         created_at = datetime.datetime.strptime(item['created_at'], '%Y-%m-%dT%H:%M:%SZ')
    #         if(datetime_from <= created_at <= datetime_to):
    #             pass
    #         if(item_filter != None):
    #             if(item['type'] in item_filter):
    #                 result.append(item)
    #         else:
    #             result.append(item)
    #     print(result)
    #     return result

    def get_activities_from_github(self, user_name):
        payload = {"Accept": "application/vnd.github.v3+json"}
        response = requests.get('https://api.github.com/users/' + user_name + '/events/public?per_page=100', headers=payload).json()
        # print(response)
        return response
