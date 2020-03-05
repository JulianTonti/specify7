import os
import logging

from django.contrib.auth.decorators import login_required
from django.http import HttpResponse
from django.template import loader
from django.conf import settings

DIR = os.path.dirname(__file__)

logger = logging.getLogger(__name__)

login_maybe_required = (lambda func: func) if settings.ANONYMOUS_USER else login_required

@login_maybe_required
def specify(request):
    resp = loader.get_template('specify.html').render({
        'use_raven': settings.RAVEN_CONFIG is not None,
    })
    return HttpResponse(resp)
